import { createHash } from "node:crypto";
import type { LinearIssueSummary } from "@/lib/linear";
import { remainingIssuesFor } from "@/lib/forecast/build";
import type { ProjectContextPackage } from "@/lib/context/package";

export const SCOPE_PROPOSAL_CONTRACT_VERSION = "2.1" as const;
export const SCOPE_PROPOSAL_COMPILER_VERSION = "scope-reconciler-three-source-2.3" as const;

export type ScopeProposalReleaseSignal = "likely_in" | "likely_out" | "boundary";
export type ScopeProposalConfidence = "high" | "medium" | "low";
export type ScopeProposalMatchState = "confidently_matched" | "suggested" | "unresolved" | "corroborated" | "conflict";
export type ScopeProposalAction = "link_existing" | "create_capability" | "none";
export type ScopeProposalOrigin = "knowledge" | "reality" | "linear";
export type ScopeProposalReconciliationState = "aligned" | "knowledge_no_execution" | "reality_no_execution" | "execution_exception" | "deferred" | "boundary" | "conflict";
export type ReleaseBoundarySource = "governed_scope_project" | "linear_execution_owner" | "ambiguous" | "unresolved";

export interface ProposalReleaseClaim {
  direction: "in" | "out";
  boundary: string | null;
  normalizedBoundary: string | null;
  specificity: "named" | "generic";
  observedAt: string | null;
  evidenceId: string;
}

export interface ProposalReleaseInterpretation {
  activeRelease: string | null;
  activeReleaseSource: ReleaseBoundarySource;
  policy: "latest_explicit_same_boundary";
  effectiveClaims: ProposalReleaseClaim[];
  supersededClaims: ProposalReleaseClaim[];
  otherBoundaryClaims: ProposalReleaseClaim[];
  genericClaims: ProposalReleaseClaim[];
}

export interface ProposalCapability {
  id: string;
  name: string;
  description: string | null;
  status: string;
  revision: number;
  workLinks: { externalId: string; state: string }[];
}

export interface ProposalSnapshot {
  id: string;
  packageId: string;
  packageVersion: string;
  producer: string;
  contextHash: string;
  createdAt: Date;
  package: unknown;
  completenessSummary: unknown;
}

export interface ProposalContextRef {
  kind: string;
  id: string;
  statement: string;
  evidenceRefs: string[];
  topicTags: string[];
  candidateTitle: string | null;
  observedAt: string | null;
  releaseClaims: ProposalReleaseClaim[];
}

export interface CompiledScopeProposalItem {
  candidateKey: string;
  title: string;
  description: string | null;
  origins: ScopeProposalOrigin[];
  reconciliationState: ScopeProposalReconciliationState;
  conflicts: string[];
  releaseSignal: ScopeProposalReleaseSignal;
  confidence: ScopeProposalConfidence;
  confidenceScore: number;
  matchState: ScopeProposalMatchState;
  action: ScopeProposalAction;
  targetCapabilityId: string | null;
  targetRevision: number | null;
  workItemIds: string[];
  alreadyLinkedItemIds: string[];
  rationale: { headline: string; signals: string[]; cautions: string[] };
  provenance: {
    linearParent: { identifier: string; title: string } | null;
    linearParents: { identifier: string; title: string }[];
    linearItems: { identifier: string; title: string; state: string; projectName: string | null; updatedAt: string | null }[];
    claimedElsewhere: { identifier: string; capabilityId: string; capabilityName: string; capabilityStatus: string }[];
    contextSnapshotId: string | null;
    contextRefs: ProposalContextRef[];
    realityCapability: { id: string; name: string; status: string; revision: number } | null;
    releaseInterpretation: ProposalReleaseInterpretation;
    method: typeof SCOPE_PROPOSAL_COMPILER_VERSION;
  };
}

export interface CompiledScopeProposal {
  contractVersion: typeof SCOPE_PROPOSAL_CONTRACT_VERSION;
  compilerVersion: typeof SCOPE_PROPOSAL_COMPILER_VERSION;
  fingerprint: string;
  sourceWatermark: {
    linearAsOf: string | null;
    linearIssueCount: number;
    linearClusterCount: number;
    contextSnapshotId: string | null;
    contextGeneratedAt: string | null;
    contextAcceptedAt: string | null;
    contextHash: string | null;
    contextProducer: string | null;
    contextRefCount: number;
    realityCapabilityCount: number;
    activeRelease: {
      name: string | null;
      normalizedName: string | null;
      aliases: string[];
      source: ReleaseBoundarySource;
      candidates: string[];
    };
    completeness: unknown;
  };
  summary: {
    likelyIn: number;
    likelyOut: number;
    boundaryReview: number;
    confidentlyMatched: number;
    suggested: number;
    unresolved: number;
    aligned: number;
    noExecution: number;
    executionExceptions: number;
    conflicts: number;
  };
  items: CompiledScopeProposalItem[];
}

const STOP = new Set([
  "a", "an", "and", "as", "at", "be", "by", "for", "from", "in", "into", "is", "it", "jsa", "of", "on", "or", "the", "this", "to", "with",
  "flow", "feature", "capability", "support", "workflow", "output", "work", "people", "user", "users", "can", "current",
]);
const BROAD_TOPICS = new Set([
  "jsa", "scope", "beta", "release", "prod", "production", "design", "team", "schedule", "safety", "qa", "infra", "infrastructure",
  "dev team", "field", "adoption", "launch date", "org structure", "mobile", "platform", "kit construct", "itrack",
]);
const CANDIDATE_FIELDS = ["capability", "capability_name", "capabilityName", "product_capability", "productCapability", "feature", "feature_name", "featureName", "product_area", "productArea"] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalize(value: string): string {
  return value.toLowerCase()
    .replace(/docufy/g, "pdf")
    .replace(/acknowledg(e)?ments?/g, "acknowledgment")
    .replace(/approvals?/g, "approval")
    .replace(/notifications?|notified/g, "notification")
    .replace(/post[- ]beta/g, "postbeta")
    .replace(/job[- ]leads?/g, "job lead")
    .replace(/\bsubmitted\b/g, "submission")
    .replace(/\bdecide(d)?\b|\breview(ing|ed)?\b/g, "approval")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return [...new Set(normalize(value).split(/\s+/).filter((token) => token.length > 1 && !STOP.has(token)))];
}

function similarity(left: string, right: string): { score: number; shared: string[] } {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  const shared = [...a].filter((token) => b.has(token));
  if (!a.size || !b.size) return { score: 0, shared };
  const containment = shared.length / Math.min(a.size, b.size);
  const jaccard = shared.length / new Set([...a, ...b]).size;
  return { score: Math.max(containment, jaccard), shared };
}

function titleCase(value: string): string {
  return value.split(/[\s_-]+/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}

function rootParent(issue: LinearIssueSummary, allById: Map<string, LinearIssueSummary>) {
  if (!issue.parentIdentifier) return null;
  let identifier = issue.parentIdentifier;
  let title = issue.parentTitle ?? identifier;
  let description: string | null = null;
  const seen = new Set([issue.identifier]);
  for (let hops = 0; hops < 12; hops += 1) {
    if (seen.has(identifier)) break;
    seen.add(identifier);
    const parent = allById.get(identifier);
    if (!parent) break;
    title = parent.title || title;
    description = parent.description;
    if (!parent.parentIdentifier) break;
    identifier = parent.parentIdentifier;
    title = parent.parentTitle ?? identifier;
  }
  return { identifier, title, description };
}

interface ContextRefInternal extends ProposalContextRef {
  current: boolean;
  disposition: string | null;
  searchable: string;
  explicitCandidate: boolean;
}

interface ResolvedReleaseBoundary {
  name: string | null;
  normalizedName: string | null;
  aliases: string[];
  source: ReleaseBoundarySource;
  candidates: string[];
}

function normalizeBoundary(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function boundaryAliases(name: string): string[] {
  const normalized = normalizeBoundary(name);
  const version = normalized.match(/\bv\d+\b/)?.[0];
  return [...new Set([normalized, ...(version ? [version] : [])])].sort((a, b) => b.length - a.length);
}

function resolveActiveRelease(configuredNames: string[] | undefined, issues: LinearIssueSummary[]): ResolvedReleaseBoundary {
  const configured = [...new Set((configuredNames ?? []).map((name) => name.trim()).filter(Boolean))].sort();
  if (configured.length === 1) {
    return { name: configured[0], normalizedName: normalizeBoundary(configured[0]), aliases: boundaryAliases(configured[0]), source: "governed_scope_project", candidates: configured };
  }
  if (configured.length > 1) return { name: null, normalizedName: null, aliases: [], source: "ambiguous", candidates: configured };
  const executionOwners = [...new Set(issues.map((issue) => issue.projectName?.trim()).filter((name): name is string => Boolean(name)))].sort();
  if (executionOwners.length === 1) {
    return { name: executionOwners[0], normalizedName: normalizeBoundary(executionOwners[0]), aliases: boundaryAliases(executionOwners[0]), source: "linear_execution_owner", candidates: executionOwners };
  }
  return { name: null, normalizedName: null, aliases: [], source: executionOwners.length > 1 ? "ambiguous" : "unresolved", candidates: executionOwners };
}

function namedBoundary(clause: string, active: ResolvedReleaseBoundary): { name: string; normalized: string } | null {
  const normalized = normalizeBoundary(clause);
  if (active.name) {
    const matchingAlias = active.aliases.find((alias) => new RegExp(`(?:^|\\s)${alias.replace(/ /g, "\\s+")}(?:$|\\s)`).test(normalized));
    if (matchingAlias) return { name: active.name, normalized: active.normalizedName! };
  }
  if (/\bbeta\b/.test(normalized)) return { name: "Beta", normalized: "beta" };
  const kitVersion = normalized.match(/\bkit(?: [a-z0-9]+){1,4} v\d+\b/)?.[0];
  if (kitVersion) return { name: titleCase(kitVersion), normalized: kitVersion };
  const version = normalized.match(/\bv\d+\b/)?.[0];
  if (version) return { name: version.toUpperCase(), normalized: version };
  if (/\bproduction\b|\bprod\b/.test(normalized)) return { name: "Production", normalized: "production" };
  return null;
}

function releaseDirections(clause: string): ("in" | "out")[] {
  const normalized = normalizeBoundary(clause);
  const directions: ("in" | "out")[] = [];
  if (/\bslated for\b|\bconfirmed in\b|\bin scope\b|\bmust ship\b|\brelease requirement\b|\bapproved for\b/.test(normalized)) directions.push("in");
  if (/\bout of\b|\bconfirmed out\b|\bnot in\b|\bnot (?:[a-z0-9]+ ){0,3}requirements?\b|\bdefer(?:red)?\b|\bfirst thing to cut\b/.test(normalized)) directions.push("out");
  return [...new Set(directions)];
}

function parseReleaseClaims(value: string, evidenceId: string, observedAt: string | null, active: ResolvedReleaseBoundary): ProposalReleaseClaim[] {
  const clauses = value.replace(/[—–]/g, ";").split(/(?:[.;]|\b(?:and|but|while)\b)/i).map((part) => part.trim()).filter(Boolean);
  const claims: ProposalReleaseClaim[] = [];
  for (const clause of clauses) {
    const boundary = namedBoundary(clause, active);
    for (const direction of releaseDirections(clause)) {
      claims.push({
        direction,
        boundary: boundary?.name ?? (normalizeBoundary(clause).includes("this release") && active.name ? active.name : null),
        normalizedBoundary: boundary?.normalized ?? (normalizeBoundary(clause).includes("this release") ? active.normalizedName : null),
        specificity: boundary ? "named" : "generic",
        observedAt,
        evidenceId,
      });
    }
  }
  return claims.filter((claim, index) => claims.findIndex((other) => other.direction === claim.direction && other.normalizedBoundary === claim.normalizedBoundary) === index);
}

function hasReleaseLanguage(value: string): boolean {
  return releaseDirections(value).length > 0;
}

function candidateTitle(fields: Record<string, unknown>, extra: Record<string, unknown>): string | null {
  for (const key of CANDIDATE_FIELDS) {
    const value = fields[key] ?? extra[key];
    if (typeof value === "string" && value.trim().length >= 3) return value.trim();
  }
  return null;
}

function contextRefs(snapshot: ProposalSnapshot | null, active: ResolvedReleaseBoundary): ContextRefInternal[] {
  if (!snapshot) return [];
  const pkg = snapshot.package as ProjectContextPackage;
  const refs: ContextRefInternal[] = [];
  for (const claim of pkg.derivedClaims ?? []) {
    const extra = record(claim.extra);
    const fields = record(extra.fields);
    const title = candidateTitle(fields, extra);
    const topicTags = strings(extra.scope);
    const observedAt = typeof extra.observedDate === "string" ? extra.observedDate : typeof extra.observedAt === "string" ? extra.observedAt : null;
    refs.push({
      kind: claim.kind, id: claim.id, statement: claim.statement, evidenceRefs: claim.evidenceRefs,
      topicTags, candidateTitle: title, observedAt,
      releaseClaims: parseReleaseClaims(`${claim.statement} ${typeof extra.disposition === "string" ? extra.disposition : ""}`, claim.id, observedAt, active),
      current: extra.current !== false && extra.isCurrent !== false,
      disposition: typeof extra.disposition === "string" ? extra.disposition : null,
      searchable: [claim.statement, claim.kind, JSON.stringify(extra), ...topicTags].join(" "),
      explicitCandidate: Boolean(title),
    });
  }
  for (const object of pkg.intelligenceObjects ?? []) {
    const fields = record(object.fields);
    const extra = record(object.extra);
    const title = candidateTitle(fields, extra);
    const topicTags = object.scope ?? [];
    const observedAt = object.observedDate ?? null;
    refs.push({
      kind: object.intelligenceType, id: object.id, statement: object.statement, evidenceRefs: object.evidenceRefs ?? [],
      topicTags, candidateTitle: title, observedAt,
      releaseClaims: parseReleaseClaims(`${object.statement} ${object.status ?? ""}`, object.id, observedAt, active),
      current: object.isCurrent, disposition: object.status ?? null,
      searchable: [object.statement, object.statementBasis ?? "", JSON.stringify(fields), JSON.stringify(extra), ...topicTags].join(" "),
      explicitCandidate: Boolean(title),
    });
  }
  return refs.filter((ref) => ref.current).sort((a, b) => a.id.localeCompare(b.id));
}

function latestClaims(claims: ProposalReleaseClaim[]): { effective: ProposalReleaseClaim[]; superseded: ProposalReleaseClaim[] } {
  const timestamps = claims.map((claim) => claim.observedAt ? Date.parse(claim.observedAt) : Number.NaN).filter(Number.isFinite);
  if (!timestamps.length) return { effective: claims, superseded: [] };
  const latest = Math.max(...timestamps);
  return {
    effective: claims.filter((claim) => claim.observedAt && Date.parse(claim.observedAt) === latest),
    superseded: claims.filter((claim) => !claim.observedAt || Date.parse(claim.observedAt) !== latest),
  };
}

interface LinearGroup {
  key: string;
  parent: { identifier: string; title: string; description: string | null } | null;
  issues: LinearIssueSummary[];
}

interface Candidate {
  key: string;
  title: string;
  description: string | null;
  reality: ProposalCapability | null;
  explicitKnowledge: boolean;
  knowledgeRefs: ContextRefInternal[];
  linearGroups: LinearGroup[];
}

function contextMatches(candidate: Pick<Candidate, "title" | "description">, refs: ContextRefInternal[]): ContextRefInternal[] {
  const search = `${candidate.title} ${candidate.description ?? ""}`;
  return refs.map((ref) => {
    const lexical = Math.max(similarity(candidate.title, ref.searchable).score, similarity(search, ref.searchable).score);
    const tag = Math.max(0, ...ref.topicTags.map((topic) => similarity(search, topic).score));
    const explicit = ref.candidateTitle ? similarity(search, ref.candidateTitle).score : 0;
    return { ref, score: Math.max(lexical, tag, explicit), exact: explicit >= 0.8 || tag >= 0.8 };
  }).filter((match) => match.exact || match.score >= 0.42)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score || a.ref.id.localeCompare(b.ref.id))
    .slice(0, 40).map((match) => match.ref);
}

function mergeCandidate(candidates: Candidate[], title: string, description: string | null, key: string, explicitKnowledge: boolean) {
  const ranked = candidates.map((candidate) => {
    const titleMatch = similarity(title, candidate.title);
    const fullMatch = similarity(`${title} ${description ?? ""}`, `${candidate.title} ${candidate.description ?? ""}`);
    return { candidate, score: Math.max(titleMatch.score, fullMatch.score), shared: titleMatch.score >= fullMatch.score ? titleMatch.shared : fullMatch.shared };
  })
    .sort((a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title));
  if (ranked[0]?.score >= 0.58 && (!ranked[1] || ranked[0].score - ranked[1].score >= 0.12)) {
    ranked[0].candidate.explicitKnowledge ||= explicitKnowledge;
    return ranked[0].candidate;
  }
  const created: Candidate = { key, title, description, reality: null, explicitKnowledge, knowledgeRefs: [], linearGroups: [] };
  candidates.push(created);
  return created;
}

function releaseClaimIsAboutCandidate(candidate: Candidate, ref: ContextRefInternal): boolean {
  if (ref.candidateTitle && similarity(candidate.title, ref.candidateTitle).score >= 0.58) return true;
  if (similarity(candidate.title, ref.statement).score >= 0.58) return true;
  return ref.topicTags.some((topic) => !BROAD_TOPICS.has(normalize(topic)) && similarity(candidate.title, topic).score >= 0.8);
}

function assessRelease(
  candidate: Candidate,
  linearIssues: LinearIssueSummary[],
  target: ProposalCapability | null,
  active: ResolvedReleaseBoundary,
) {
  const knowledgeClaims = candidate.knowledgeRefs.filter((ref) => releaseClaimIsAboutCandidate(candidate, ref)).flatMap((ref) => ref.releaseClaims);
  const linearClaims = linearIssues.flatMap((issue) => issue.labels.flatMap((label, index) => parseReleaseClaims(label, `${issue.identifier}:label:${index}`, issue.updatedAt ?? null, active)));
  const allClaims = [...knowledgeClaims, ...linearClaims];
  const sameBoundary = active.normalizedName
    ? allClaims.filter((claim) => claim.specificity === "named" && claim.normalizedBoundary === active.normalizedName)
    : [];
  const otherBoundaryClaims = allClaims.filter((claim) => claim.specificity === "named" && (!active.normalizedName || claim.normalizedBoundary !== active.normalizedName));
  const genericClaims = allClaims.filter((claim) => claim.specificity === "generic");
  const { effective: effectiveClaims, superseded: supersededClaims } = latestClaims(sameBoundary);
  const { effective: effectiveGeneric } = latestClaims(genericClaims);
  const inClaims = effectiveClaims.filter((claim) => claim.direction === "in");
  const outClaims = effectiveClaims.filter((claim) => claim.direction === "out");
  const genericIn = effectiveGeneric.some((claim) => claim.direction === "in");
  const genericOut = effectiveGeneric.some((claim) => claim.direction === "out");
  const realitySignal = active.name && target
    ? target.status === "accepted" ? "in" : ["outside", "future", "removed"].includes(target.status) ? "out" : null
    : null;
  const conflicts: string[] = [];
  const ids = (claims: ProposalReleaseClaim[]) => claims.map((claim) => claim.evidenceId).sort().join(", ");
  if (inClaims.length && outClaims.length) conflicts.push(`Opposing current claims for ${active.name}: in [${ids(inClaims)}] versus out [${ids(outClaims)}].`);
  if (realitySignal === "in" && outClaims.length && !inClaims.length) conflicts.push(`Accepted Reality is in ${active.name}, but current same-boundary evidence says out [${ids(outClaims)}].`);
  if (realitySignal === "out" && inClaims.length && !outClaims.length) conflicts.push(`Accepted Reality is out of ${active.name}, but current same-boundary evidence says in [${ids(inClaims)}].`);
  let releaseSignal: ScopeProposalReleaseSignal = "boundary";
  if (!conflicts.length && active.name) {
    if (inClaims.length && !outClaims.length) releaseSignal = "likely_in";
    else if (outClaims.length && !inClaims.length) releaseSignal = "likely_out";
    else if (realitySignal === "in") releaseSignal = "likely_in";
    else if (realitySignal === "out") releaseSignal = "likely_out";
    else if (!target && genericIn !== genericOut) releaseSignal = genericIn ? "likely_in" : "likely_out";
  }
  const interpretation: ProposalReleaseInterpretation = {
    activeRelease: active.name,
    activeReleaseSource: active.source,
    policy: "latest_explicit_same_boundary",
    effectiveClaims,
    supersededClaims,
    otherBoundaryClaims,
    genericClaims,
  };
  return { releaseSignal, conflicts, interpretation, effectiveClaims };
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Deterministic three-ledger reconciliation. Current structured intelligence
 * may propose shape, accepted Scope Reality is the governed baseline, and
 * Linear corroborates execution. A Linear-only cluster may be offered for
 * explicit operator review, but is deliberately low-confidence and therefore
 * never eligible for bulk staging.
 */
export function compileScopeProposal(input: {
  includeTriage: boolean;
  issues: LinearIssueSummary[];
  capabilities: ProposalCapability[];
  snapshot: ProposalSnapshot | null;
  activeReleaseNames?: string[];
  generatedAt?: Date;
}): CompiledScopeProposal {
  const allById = new Map(input.issues.map((issue) => [issue.identifier, issue]));
  const executable = remainingIssuesFor(input.issues, input.includeTriage).sort((a, b) => a.identifier.localeCompare(b.identifier));
  const grouped = new Map<string, LinearGroup>();
  for (const issue of executable) {
    const parent = rootParent(issue, allById);
    const key = parent ? `linear-parent:${parent.identifier}` : `linear-unresolved:${issue.identifier}`;
    const group = grouped.get(key) ?? { key, parent, issues: [] };
    group.issues.push(issue);
    grouped.set(key, group);
  }
  const linearGroups = [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key));
  const activeRelease = resolveActiveRelease(input.activeReleaseNames, input.issues);
  const refs = contextRefs(input.snapshot, activeRelease);
  const activeWorkOwners = new Map<string, { capabilityId: string; capabilityName: string; capabilityStatus: string }[]>();
  for (const capability of input.capabilities) {
    for (const link of capability.workLinks.filter((item) => item.state === "active" || item.state === "configured")) {
      const owners = activeWorkOwners.get(link.externalId) ?? [];
      owners.push({ capabilityId: capability.id, capabilityName: capability.name, capabilityStatus: capability.status });
      activeWorkOwners.set(link.externalId, owners);
    }
  }

  // Ledger one: governed Reality always gets a seat, even with no work.
  const candidates: Candidate[] = [...input.capabilities].sort((a, b) => a.id.localeCompare(b.id)).map((capability) => ({
    key: `reality:${capability.id}`, title: capability.name, description: capability.description, reality: capability,
    explicitKnowledge: false, knowledgeRefs: [], linearGroups: [],
  }));

  // Ledger two: only producer-structured capability fields create standalone
  // candidates. Topic tags may reinforce shape, but prose is never promoted
  // merely because it sounds feature-like.
  for (const ref of refs.filter((item) => item.candidateTitle)) {
    const candidate = mergeCandidate(candidates, ref.candidateTitle!, ref.statement, `knowledge:${ref.id}`, true);
    if (!candidate.knowledgeRefs.some((item) => item.id === ref.id)) candidate.knowledgeRefs.push(ref);
  }
  const topicGroups = new Map<string, ContextRefInternal[]>();
  for (const ref of refs) {
    for (const raw of ref.topicTags) {
      const topic = normalize(raw);
      if (!topic || BROAD_TOPICS.has(topic) || topic.length < 4) continue;
      const bucket = topicGroups.get(topic) ?? [];
      bucket.push(ref);
      topicGroups.set(topic, bucket);
    }
  }
  for (const [topic, topicRefs] of [...topicGroups].sort(([a], [b]) => a.localeCompare(b))) {
    const hasShapeSignal = topicRefs.some((ref) => ["decision", "opportunity"].includes(normalize(ref.kind)) || hasReleaseLanguage(`${ref.statement} ${ref.disposition ?? ""}`));
    if (topicRefs.length < 2 || !hasShapeSignal) continue;
    const candidate = mergeCandidate(candidates, titleCase(topic), topicRefs[0].statement, `knowledge-topic:${topic}`, false);
    for (const ref of topicRefs) if (!candidate.knowledgeRefs.some((item) => item.id === ref.id)) candidate.knowledgeRefs.push(ref);
  }
  for (const candidate of candidates) {
    const matches = contextMatches(candidate, refs);
    for (const ref of matches) if (!candidate.knowledgeRefs.some((item) => item.id === ref.id)) candidate.knowledgeRefs.push(ref);
    candidate.knowledgeRefs.sort((a, b) => a.id.localeCompare(b.id));
  }

  // Ledger three: unmatched Linear hierarchy stays an execution exception.
  for (const group of linearGroups) {
    const groupText = `${group.parent?.title ?? group.issues[0].title} ${group.parent?.description ?? ""} ${group.issues.map((issue) => issue.title).join(" ")}`;
    const groupTitle = group.parent?.title ?? group.issues[0].title;
    // Pure Linear exceptions are not product-shape authority and must never
    // become magnets for later groups. Only governed Reality or structured
    // Knowledge may corroborate multiple execution groups. Parent/child work
    // is already grouped above by its explicit Linear hierarchy.
    const shapeCandidates = candidates.filter((candidate) => candidate.reality || candidate.knowledgeRefs.length > 0);
    const ranked = shapeCandidates.map((candidate) => {
      const titleMatch = similarity(groupTitle, candidate.title);
      const fullMatch = similarity(groupText, `${candidate.title} ${candidate.description ?? ""}`);
      return { candidate, score: Math.max(titleMatch.score, fullMatch.score), shared: titleMatch.score >= fullMatch.score ? titleMatch.shared : fullMatch.shared };
    })
      .sort((a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title));
    const best = ranked[0];
    const safe = best && best.score >= 0.48 && (!ranked[1] || best.score - ranked[1].score >= 0.12);
    if (safe) {
      best.candidate.linearGroups.push(group);
      continue;
    }
    const title = group.parent?.title ?? group.issues[0].title;
    candidates.push({ key: group.key, title, description: group.parent?.description ?? group.issues[0].description, reality: null, explicitKnowledge: false, knowledgeRefs: [], linearGroups: [group] });
  }

  const items: CompiledScopeProposalItem[] = candidates.map((candidate) => {
    const linearIssues = candidate.linearGroups.flatMap((group) => group.issues).sort((a, b) => a.identifier.localeCompare(b.identifier));
    const matchedWorkItemIds = [...new Set(linearIssues.map((issue) => issue.identifier))];
    const target = candidate.reality;
    const claimedElsewhere = matchedWorkItemIds.flatMap((identifier) =>
      (activeWorkOwners.get(identifier) ?? [])
        .filter((owner) => owner.capabilityId !== target?.id)
        .map((owner) => ({ identifier, ...owner })),
    );
    const claimedElsewhereIds = new Set(claimedElsewhere.map((item) => item.identifier));
    // Accepted Reality owns an active execution link until an operator
    // explicitly moves it. A proposal may still explain the semantic match,
    // but it must never bulk-stage or commit that work to a second capability.
    const workItemIds = matchedWorkItemIds.filter((identifier) => !claimedElsewhereIds.has(identifier));
    const activeLinks = target?.workLinks.filter((link) => link.state === "active" || link.state === "configured") ?? [];
    const alreadyLinkedItemIds = workItemIds.filter((id) => activeLinks.some((link) => link.externalId === id));
    const missing = workItemIds.filter((id) => !alreadyLinkedItemIds.includes(id));
    const origins: ScopeProposalOrigin[] = [
      ...(candidate.knowledgeRefs.length ? ["knowledge" as const] : []),
      ...(target ? ["reality" as const] : []),
      ...(linearIssues.length ? ["linear" as const] : []),
    ];
    const { releaseSignal, conflicts, interpretation, effectiveClaims } = assessRelease(candidate, linearIssues, target, activeRelease);
    const linearOnly = origins.length === 1 && origins[0] === "linear";
    const realityNoExecution = Boolean(target && activeLinks.length === 0 && workItemIds.length === 0);
    const knowledgeNoExecution = Boolean(!target && candidate.knowledgeRefs.length && workItemIds.length === 0);
    const reconciliationState: ScopeProposalReconciliationState = conflicts.length ? "conflict"
      : releaseSignal === "likely_out" ? "deferred"
        : linearOnly ? "execution_exception"
          : realityNoExecution ? "reality_no_execution"
            : knowledgeNoExecution ? "knowledge_no_execution"
              : releaseSignal === "boundary" ? "boundary" : "aligned";
    let action: ScopeProposalAction = "none";
    if (!conflicts.length && target && workItemIds.length) action = "link_existing";
    if (!conflicts.length && !target && candidate.explicitKnowledge && releaseSignal !== "boundary") action = "create_capability";
    // Linear alone cannot establish product shape, so these candidates stay
    // low-confidence and are never bulk-stage eligible. It can still expose
    // an operator action: explicitly link the work to accepted shape, create
    // a reviewed boundary, or place it out/later. Without this, singleton
    // execution exceptions make the coverage gate impossible to close.
    if (!conflicts.length && linearOnly && workItemIds.length > 0) action = "create_capability";
    const corroborated = Boolean(target && workItemIds.length > 0 && missing.length === 0);
    let confidenceScore = 18;
    if (origins.includes("knowledge")) confidenceScore += candidate.explicitKnowledge ? 28 : 20;
    if (origins.includes("reality")) confidenceScore += 30;
    if (origins.includes("linear")) confidenceScore += candidate.linearGroups.every((group) => Boolean(group.parent)) ? 24 : 12;
    if (effectiveClaims.length) confidenceScore += 8;
    if (linearOnly) confidenceScore = Math.min(confidenceScore, 38);
    if (reconciliationState === "boundary") confidenceScore = Math.min(confidenceScore, 55);
    if (conflicts.length) confidenceScore = Math.min(confidenceScore, 44);
    confidenceScore = Math.max(0, Math.min(96, confidenceScore));
    const confidence: ScopeProposalConfidence = confidenceScore >= 78 ? "high" : confidenceScore >= 52 ? "medium" : "low";
    const matchState: ScopeProposalMatchState = conflicts.length ? "conflict" : corroborated ? "corroborated" : linearOnly ? "unresolved" : confidence === "high" && action === "link_existing" ? "confidently_matched" : "suggested";
    const signals = [
      ...(candidate.knowledgeRefs.length ? [`Knowledge contributes ${candidate.knowledgeRefs.length} current, cited ${candidate.knowledgeRefs.length === 1 ? "signal" : "signals"}.`] : ["No current structured-knowledge candidate safely matched."]),
      ...(target ? [`Accepted Scope Reality contributes “${target.name}” at revision ${target.revision}.`] : ["No accepted Scope Reality capability safely matched."]),
      ...(linearIssues.length ? [`Linear contributes ${linearIssues.length} executable ${linearIssues.length === 1 ? "item" : "items"}${candidate.linearGroups[0]?.parent ? ` under ${candidate.linearGroups.map((group) => group.parent?.identifier).filter(Boolean).join(", ")}` : " without a product-shape parent"}.`] : ["No current executable Linear work safely matched."]),
    ];
    const cautions = [
      ...conflicts,
      ...(linearOnly ? ["Linear hierarchy is execution structure, not product-shape authority; operator reconciliation is required."] : []),
      ...(realityNoExecution ? ["Accepted Reality has no active work mapping and no current executable cluster."] : []),
      ...(knowledgeNoExecution ? ["Knowledge proposes shape, but no current Linear execution was found."] : []),
      ...(linearIssues.some((issue) => issue.estimate === null) ? ["One or more executable items have no Linear estimate."] : []),
      ...(claimedElsewhere.length ? [`${claimedElsewhereIds.size} matched Linear ${claimedElsewhereIds.size === 1 ? "item is" : "items are"} already governed by another Scope capability and ${claimedElsewhereIds.size === 1 ? "is" : "are"} excluded from this proposal.`] : []),
      ...(releaseSignal === "boundary" && !conflicts.length ? ["Available evidence does not establish a single in/out release decision."] : []),
    ];
    const headline = reconciliationState === "conflict" ? "Signals disagree; accepted Reality remains authoritative until an operator resolves the boundary."
      : reconciliationState === "execution_exception" && action === "create_capability" ? candidate.linearGroups[0]?.parent
        ? `Linear contains ${workItemIds.length} current ${workItemIds.length === 1 ? "item" : "items"} under ${candidate.linearGroups[0].parent.identifier}. Review whether to create a capability, attach selected work to an existing one, or defer it.`
        : `Linear contains ${workItemIds.length} current ${workItemIds.length === 1 ? "item" : "items"} without grounded product shape. Review whether to link ${workItemIds.length === 1 ? "it" : "them"} to an accepted capability, create a boundary, or defer ${workItemIds.length === 1 ? "it" : "them"}.`
        : reconciliationState === "execution_exception" ? "Linear work has no grounded product-shape candidate yet."
        : reconciliationState === "reality_no_execution" ? "Accepted product shape currently has no active execution mapped."
          : reconciliationState === "knowledge_no_execution" ? "Structured knowledge proposes product shape, but current execution is absent."
            : reconciliationState === "deferred" ? "Current evidence places this capability out or later."
              : action === "link_existing" && missing.length ? `Propose ${missing.length} reviewed work ${missing.length === 1 ? "link" : "links"} to ${target!.name}.`
                : action === "create_capability" ? (linearOnly ? "Propose a reviewed capability from a parent-backed Linear execution cluster." : "Propose a new capability from an explicit structured-knowledge field.")
                  : corroborated ? "Knowledge, accepted Reality, and Linear currently corroborate one another; open this candidate to review individual ticket membership."
                    : "This boundary is visible for operator judgment; no automatic Reality write is proposed.";
    const linearParents = candidate.linearGroups.flatMap((group) => group.parent ? [{ identifier: group.parent.identifier, title: group.parent.title }] : []);
    return {
      candidateKey: candidate.key, title: candidate.title, description: candidate.description, origins, reconciliationState, conflicts,
      releaseSignal, confidence, confidenceScore, matchState, action, targetCapabilityId: target?.id ?? null, targetRevision: target?.revision ?? null,
      workItemIds, alreadyLinkedItemIds, rationale: { headline, signals, cautions },
      provenance: {
        linearParent: linearParents[0] ?? null,
        linearParents,
        linearItems: linearIssues.map((issue) => ({ identifier: issue.identifier, title: issue.title, state: issue.state, projectName: issue.projectName, updatedAt: issue.updatedAt ?? null })),
        claimedElsewhere,
        contextSnapshotId: input.snapshot?.id ?? null,
        contextRefs: candidate.knowledgeRefs.map((ref) => ({ kind: ref.kind, id: ref.id, statement: ref.statement, evidenceRefs: ref.evidenceRefs, topicTags: ref.topicTags, candidateTitle: ref.candidateTitle, observedAt: ref.observedAt, releaseClaims: ref.releaseClaims })),
        realityCapability: target ? { id: target.id, name: target.name, status: target.status, revision: target.revision } : null,
        releaseInterpretation: interpretation,
        method: SCOPE_PROPOSAL_COMPILER_VERSION,
      },
    };
  }).sort((a, b) => {
    const state: Record<ScopeProposalReconciliationState, number> = { conflict: 0, execution_exception: 1, boundary: 2, knowledge_no_execution: 3, reality_no_execution: 4, aligned: 5, deferred: 6 };
    return state[a.reconciliationState] - state[b.reconciliationState] || b.confidenceScore - a.confidenceScore || a.title.localeCompare(b.title);
  });

  const latestLinear = input.issues.map((issue) => issue.updatedAt ? Date.parse(issue.updatedAt) : Number.NaN).filter(Number.isFinite).reduce((latest, value) => Math.max(latest, value), 0);
  const pkg = input.snapshot?.package as ProjectContextPackage | undefined;
  const sourceWatermark = {
    linearAsOf: latestLinear ? new Date(latestLinear).toISOString() : null,
    linearIssueCount: input.issues.length,
    linearClusterCount: linearGroups.length,
    contextSnapshotId: input.snapshot?.id ?? null,
    contextGeneratedAt: pkg?.generatedAt ?? null,
    contextAcceptedAt: input.snapshot?.createdAt.toISOString() ?? null,
    contextHash: input.snapshot?.contextHash ?? null,
    contextProducer: input.snapshot?.producer ?? null,
    contextRefCount: refs.length,
    realityCapabilityCount: input.capabilities.length,
    activeRelease,
    completeness: input.snapshot?.completenessSummary ?? null,
  };
  const summary = {
    likelyIn: items.filter((item) => item.releaseSignal === "likely_in").length,
    likelyOut: items.filter((item) => item.releaseSignal === "likely_out").length,
    boundaryReview: items.filter((item) => item.releaseSignal === "boundary").length,
    confidentlyMatched: items.filter((item) => item.matchState === "confidently_matched" || item.matchState === "corroborated").length,
    suggested: items.filter((item) => item.action !== "none").length,
    unresolved: items.filter((item) => item.matchState === "unresolved" || item.matchState === "conflict").length,
    aligned: items.filter((item) => item.reconciliationState === "aligned").length,
    noExecution: items.filter((item) => item.reconciliationState === "knowledge_no_execution" || item.reconciliationState === "reality_no_execution").length,
    executionExceptions: items.filter((item) => item.reconciliationState === "execution_exception").length,
    conflicts: items.filter((item) => item.reconciliationState === "conflict").length,
  };
  const fingerprint = digest({
    contractVersion: SCOPE_PROPOSAL_CONTRACT_VERSION, compilerVersion: SCOPE_PROPOSAL_COMPILER_VERSION, sourceWatermark,
    capabilities: [...input.capabilities].sort((a, b) => a.id.localeCompare(b.id)).map((capability) => ({
      id: capability.id, name: capability.name, description: capability.description, status: capability.status, revision: capability.revision,
      workLinks: capability.workLinks.map((link) => `${link.externalId}:${link.state}`).sort(),
    })),
    items,
  });
  return { contractVersion: SCOPE_PROPOSAL_CONTRACT_VERSION, compilerVersion: SCOPE_PROPOSAL_COMPILER_VERSION, fingerprint, sourceWatermark, summary, items };
}
