import { createHash } from "node:crypto";
import type { LinearIssueSummary } from "@/lib/linear";
import { remainingIssuesFor } from "@/lib/forecast/build";
import type { ProjectContextPackage } from "@/lib/context/package";

export const SCOPE_PROPOSAL_CONTRACT_VERSION = "1.0" as const;
export const SCOPE_PROPOSAL_COMPILER_VERSION = "scope-proposal-deterministic-1.0" as const;

export type ScopeProposalReleaseSignal = "likely_in" | "likely_out" | "boundary";
export type ScopeProposalConfidence = "high" | "medium" | "low";
export type ScopeProposalMatchState = "confidently_matched" | "suggested" | "unresolved" | "corroborated";
export type ScopeProposalAction = "link_existing" | "create_capability" | "none";

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

export interface CompiledScopeProposalItem {
  candidateKey: string;
  title: string;
  description: string | null;
  releaseSignal: ScopeProposalReleaseSignal;
  confidence: ScopeProposalConfidence;
  confidenceScore: number;
  matchState: ScopeProposalMatchState;
  action: ScopeProposalAction;
  targetCapabilityId: string | null;
  targetRevision: number | null;
  workItemIds: string[];
  alreadyLinkedItemIds: string[];
  rationale: {
    headline: string;
    signals: string[];
    cautions: string[];
  };
  provenance: {
    linearParent: { identifier: string; title: string } | null;
    linearItems: { identifier: string; state: string; projectName: string | null; updatedAt: string | null }[];
    contextSnapshotId: string | null;
    contextRefs: { kind: string; id: string; statement: string; evidenceRefs: string[] }[];
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
    contextSnapshotId: string | null;
    contextGeneratedAt: string | null;
    contextAcceptedAt: string | null;
    contextHash: string | null;
    contextProducer: string | null;
    completeness: unknown;
  };
  summary: {
    likelyIn: number;
    likelyOut: number;
    boundaryReview: number;
    confidentlyMatched: number;
    suggested: number;
    unresolved: number;
  };
  items: CompiledScopeProposalItem[];
}

const STOP = new Set([
  "a", "an", "and", "as", "at", "be", "by", "for", "from", "in", "into", "is", "it", "jsa", "of", "on", "or", "the", "this", "to", "with",
  "flow", "feature", "capability", "support", "workflow", "output",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/docufy/g, "pdf")
    .replace(/acknowledg(e)?ment/g, "acknowledgment")
    .replace(/approvals?/g, "approval")
    .replace(/notifications?/g, "notification")
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

function rootParent(
  issue: LinearIssueSummary,
  allById: Map<string, LinearIssueSummary>,
): { identifier: string; title: string; description: string | null } | null {
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

interface ContextRef {
  kind: string;
  id: string;
  statement: string;
  evidenceRefs: string[];
  disposition: string | null;
  current: boolean | null;
  searchable: string;
}

function contextRefs(snapshot: ProposalSnapshot | null): ContextRef[] {
  if (!snapshot) return [];
  const pkg = snapshot.package as ProjectContextPackage;
  const refs: ContextRef[] = [];
  for (const claim of pkg.derivedClaims ?? []) {
    const extra = record(claim.extra);
    refs.push({
      kind: claim.kind,
      id: claim.id,
      statement: claim.statement,
      evidenceRefs: claim.evidenceRefs,
      disposition: typeof extra.disposition === "string" ? extra.disposition : null,
      current: null,
      searchable: [claim.statement, claim.kind, ...claim.evidenceRefs].join(" "),
    });
  }
  for (const object of pkg.intelligenceObjects ?? []) {
    refs.push({
      kind: object.intelligenceType,
      id: object.id,
      statement: object.statement,
      evidenceRefs: object.evidenceRefs ?? [],
      disposition: object.status ?? null,
      current: object.isCurrent,
      searchable: [object.statement, object.statementBasis ?? "", JSON.stringify(object.fields ?? {}), ...(object.scope ?? [])].join(" "),
    });
  }
  return refs;
}

function explicitReleaseSignal(refs: ContextRef[], issues: LinearIssueSummary[]): ScopeProposalReleaseSignal {
  const text = normalize([
    ...refs.filter((ref) => ref.current !== false).map((ref) => `${ref.statement} ${ref.disposition ?? ""}`),
    ...issues.flatMap((issue) => issue.labels),
  ].join(" "));
  if (/\b(out of scope|defer|deferred|future|later|post beta|stretch goal|not in release)\b/.test(text)) return "likely_out";
  if (/\b(in scope|accepted|must ship|release requirement|beta scope|v1 scope)\b/.test(text)) return "likely_in";
  return "boundary";
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Deterministic, inspectable synthesis only. The compiler never writes
 * Capability or CapabilityWorkLink rows and never assigns probabilistic
 * confidence that the available evidence cannot explain.
 */
export function compileScopeProposal(input: {
  includeTriage: boolean;
  issues: LinearIssueSummary[];
  capabilities: ProposalCapability[];
  snapshot: ProposalSnapshot | null;
  generatedAt?: Date;
}): CompiledScopeProposal {
  const executable = remainingIssuesFor(input.issues, input.includeTriage)
    .sort((left, right) => left.identifier.localeCompare(right.identifier));
  const allById = new Map(input.issues.map((issue) => [issue.identifier, issue]));
  const refs = contextRefs(input.snapshot);
  const grouped = new Map<string, { parent: ReturnType<typeof rootParent>; issues: LinearIssueSummary[] }>();

  for (const issue of executable) {
    const parent = rootParent(issue, allById);
    const key = parent ? `linear-parent:${parent.identifier}` : `linear-unresolved:${issue.identifier}`;
    const bucket = grouped.get(key) ?? { parent, issues: [] };
    bucket.issues.push(issue);
    grouped.set(key, bucket);
  }

  const activeLinkOwner = new Map<string, ProposalCapability>();
  for (const capability of input.capabilities) {
    for (const link of capability.workLinks) {
      if (link.state === "active" || link.state === "configured") activeLinkOwner.set(link.externalId, capability);
    }
  }

  const items: CompiledScopeProposalItem[] = [];
  for (const [candidateKey, group] of grouped) {
    const title = group.parent?.title ?? group.issues[0].title;
    const description = group.parent?.description ?? group.issues[0].description;
    const workItemIds = group.issues.map((issue) => issue.identifier).sort();
    const linkedOwners = [...new Set(workItemIds.map((id) => activeLinkOwner.get(id)).filter((value): value is ProposalCapability => Boolean(value)))];
    const rankedCapabilities = input.capabilities
      .map((capability) => ({ capability, ...similarity(`${title} ${description ?? ""}`, `${capability.name} ${capability.description ?? ""}`) }))
      .sort((a, b) => b.score - a.score || a.capability.name.localeCompare(b.capability.name));
    const best = rankedCapabilities[0];
    const second = rankedCapabilities[1];
    const exactOwner = linkedOwners.length === 1 ? linkedOwners[0] : null;
    const uniqueLexical = best && best.score >= 0.5 && (!second || best.score - second.score >= 0.18);
    const target = exactOwner ?? (uniqueLexical ? best.capability : null);

    const clusterIdentifiers = [group.parent?.identifier, ...workItemIds].filter((value): value is string => Boolean(value));
    const clusterSearch = `${group.parent?.identifier ?? ""} ${title} ${description ?? ""} ${workItemIds.join(" ")}`;
    const matchedRefs = refs
      .map((ref) => ({ ref, ...similarity(clusterSearch, ref.searchable), exactId: clusterIdentifiers.some((id) => ref.searchable.includes(id)) }))
      .filter((match) => match.exactId || match.score >= 0.45)
      .sort((a, b) => Number(b.exactId) - Number(a.exactId) || b.score - a.score)
      .slice(0, 6)
      .map((match) => match.ref);

    const alreadyLinkedItemIds = target
      ? workItemIds.filter((id) => target.workLinks.some((link) => link.externalId === id && (link.state === "active" || link.state === "configured")))
      : [];
    const missing = workItemIds.filter((id) => !alreadyLinkedItemIds.includes(id));
    const explicitSignal = explicitReleaseSignal(matchedRefs, group.issues);
    const releaseSignal: ScopeProposalReleaseSignal = explicitSignal !== "boundary"
      ? explicitSignal
      : target
        ? target.status === "accepted" ? "likely_in" : "likely_out"
        : "boundary";

    const ambiguousOwners = linkedOwners.length > 1;
    const hasHierarchy = Boolean(group.parent);
    const evidenceBacked = matchedRefs.length > 0;
    const exactContextId = matchedRefs.some((ref) => clusterIdentifiers.some((id) => ref.searchable.includes(id)));
    const corroborated = Boolean(target) && missing.length === 0;
    let confidenceScore = 28;
    if (hasHierarchy) confidenceScore += 22;
    if (target) confidenceScore += exactOwner ? 30 : Math.round((best?.score ?? 0) * 24);
    if (evidenceBacked) confidenceScore += exactContextId ? 18 : 10;
    if (ambiguousOwners) confidenceScore = Math.min(confidenceScore, 35);
    if (!hasHierarchy) confidenceScore = Math.min(confidenceScore, 40);
    confidenceScore = Math.max(0, Math.min(100, confidenceScore));
    const confidence: ScopeProposalConfidence = confidenceScore >= 78 ? "high" : confidenceScore >= 52 ? "medium" : "low";
    const matchState: ScopeProposalMatchState = corroborated
      ? "corroborated"
      : ambiguousOwners || (!target && !hasHierarchy)
        ? "unresolved"
        : confidence === "high" && target
          ? "confidently_matched"
          : "suggested";
    const action: ScopeProposalAction = corroborated ? "none" : target ? "link_existing" : hasHierarchy ? "create_capability" : "none";

    const signals = [
      hasHierarchy ? `${workItemIds.length} executable ${workItemIds.length === 1 ? "item follows" : "items follow"} Linear parent ${group.parent!.identifier}.` : "No Linear parent identifies a capability boundary.",
      target ? `${exactOwner ? "Existing work links" : "Unique name and description overlap"} point to “${target.name}”.` : "No existing accepted capability is a safe unique match.",
      evidenceBacked ? `${matchedRefs.length} current structured-context ${matchedRefs.length === 1 ? "reference corroborates" : "references corroborate"} this cluster.` : "No current structured-context reference safely matched this cluster.",
    ];
    const cautions = [
      ...(!hasHierarchy ? ["Keep in the exceptions queue until a product boundary is chosen."] : []),
      ...(ambiguousOwners ? ["Execution items currently point at more than one capability."] : []),
      ...(releaseSignal === "boundary" ? ["Available evidence does not state an in/out release decision."] : []),
      ...(group.issues.some((issue) => issue.estimate === null) ? ["One or more executable items have no Linear estimate."] : []),
    ];

    items.push({
      candidateKey,
      title,
      description,
      releaseSignal,
      confidence,
      confidenceScore,
      matchState,
      action,
      targetCapabilityId: target?.id ?? null,
      targetRevision: target?.revision ?? null,
      workItemIds,
      alreadyLinkedItemIds,
      rationale: {
        headline: corroborated
          ? `Linear currently corroborates ${target!.name}; no Reality change is proposed.`
          : action === "link_existing"
            ? `Propose ${missing.length} missing work ${missing.length === 1 ? "link" : "links"} to ${target!.name}.`
            : action === "create_capability"
              ? `Propose a capability boundary from Linear's explicit parent hierarchy.`
              : "This cluster needs operator reconciliation before it can become product shape.",
        signals,
        cautions,
      },
      provenance: {
        linearParent: group.parent ? { identifier: group.parent.identifier, title: group.parent.title } : null,
        linearItems: group.issues.map((issue) => ({
          identifier: issue.identifier,
          state: issue.state,
          projectName: issue.projectName,
          updatedAt: issue.updatedAt ?? null,
        })),
        contextSnapshotId: input.snapshot?.id ?? null,
        contextRefs: matchedRefs.map((ref) => ({ kind: ref.kind, id: ref.id, statement: ref.statement, evidenceRefs: ref.evidenceRefs })),
        method: SCOPE_PROPOSAL_COMPILER_VERSION,
      },
    });
  }

  items.sort((a, b) => {
    const state = { confidently_matched: 0, suggested: 1, unresolved: 2, corroborated: 3 } as const;
    return state[a.matchState] - state[b.matchState] || b.confidenceScore - a.confidenceScore || a.title.localeCompare(b.title);
  });

  const latestLinear = input.issues
    .map((issue) => issue.updatedAt ? Date.parse(issue.updatedAt) : Number.NaN)
    .filter(Number.isFinite)
    .reduce((latest, value) => Math.max(latest, value), 0);
  const pkg = input.snapshot?.package as ProjectContextPackage | undefined;
  const sourceWatermark = {
    linearAsOf: latestLinear ? new Date(latestLinear).toISOString() : null,
    linearIssueCount: input.issues.length,
    contextSnapshotId: input.snapshot?.id ?? null,
    contextGeneratedAt: pkg?.generatedAt ?? null,
    contextAcceptedAt: input.snapshot?.createdAt.toISOString() ?? null,
    contextHash: input.snapshot?.contextHash ?? null,
    contextProducer: input.snapshot?.producer ?? null,
    completeness: input.snapshot?.completenessSummary ?? null,
  };
  const summary = {
    likelyIn: items.filter((item) => item.releaseSignal === "likely_in").length,
    likelyOut: items.filter((item) => item.releaseSignal === "likely_out").length,
    boundaryReview: items.filter((item) => item.releaseSignal === "boundary").length,
    confidentlyMatched: items.filter((item) => item.matchState === "confidently_matched" || item.matchState === "corroborated").length,
    suggested: items.filter((item) => item.matchState === "suggested" || item.matchState === "confidently_matched").length,
    unresolved: items.filter((item) => item.matchState === "unresolved").length,
  };
  const fingerprint = digest({
    contractVersion: SCOPE_PROPOSAL_CONTRACT_VERSION,
    compilerVersion: SCOPE_PROPOSAL_COMPILER_VERSION,
    sourceWatermark,
    capabilities: [...input.capabilities].sort((left, right) => left.id.localeCompare(right.id)).map((capability) => ({
      id: capability.id,
      name: capability.name,
      description: capability.description,
      status: capability.status,
      revision: capability.revision,
      workLinks: capability.workLinks.map((link) => `${link.externalId}:${link.state}`).sort(),
    })),
    items,
  });

  return {
    contractVersion: SCOPE_PROPOSAL_CONTRACT_VERSION,
    compilerVersion: SCOPE_PROPOSAL_COMPILER_VERSION,
    fingerprint,
    sourceWatermark,
    summary,
    items,
  };
}
