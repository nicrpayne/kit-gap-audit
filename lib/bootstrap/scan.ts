import MiniSearch from "minisearch";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fuzzinessFor, prefixFor } from "@/lib/audit/searchIndex";
import { normalizeSearchText } from "@/lib/audit/searchText";
import type { JsonValue } from "@/lib/context/package";
import {
  BOOTSTRAP_COMPILER_VERSION,
  BOOTSTRAP_PACKAGE_VERSION,
  type BootstrapAmbiguity,
  type BootstrapArtifact,
  type BootstrapEvidencePassage,
  type BootstrapGap,
  type BootstrapIntelligenceHead,
  type BootstrapProposal,
  type MatchReason,
  type ProjectBootstrapPackageV1,
  type ProjectIdentityQuery,
  type ProviderCoverage,
} from "./contracts";
import { bootstrapHash, stableId } from "./hash";
import { resolveRefreshDisposition } from "./rescan";

export interface CorpusArtifact {
  id: string;
  provider: string;
  kind: string;
  title: string;
  canonicalRef: string;
  deepLink?: string;
  observedAt?: string;
  text: string;
  derivative: boolean;
  lineageRootIds: string[];
  scopeLabel?: string;
}

export interface CorpusEvidence {
  id: string;
  artifactId: string;
  exactQuote: string;
  locator: Record<string, JsonValue>;
  occurredAt?: string;
  independence: "independent" | "derivative" | "unknown";
  lineageRootIds: string[];
}

export interface CorpusIntelligence {
  id: string;
  type: string;
  statement: string;
  isCurrent: boolean;
  status?: string;
  observedDate?: string;
  fields: Record<string, JsonValue>;
  evidenceRefs: string[];
  supersedes: string[];
  contradictedBy: string[];
  provenance: Record<string, JsonValue>;
  sourceSnapshotId: string;
}

export interface BootstrapCorpus {
  artifacts: CorpusArtifact[];
  evidence: CorpusEvidence[];
  intelligence: CorpusIntelligence[];
  derivedClaims: {
    id: string;
    kind: string;
    statement: string;
    evidenceRefs: string[];
    extra: Record<string, JsonValue>;
    sourceSnapshotId: string;
  }[];
  activeIdentities: { id: string; name: string; projectNames: string[] }[];
  registrations: { sourceType: string; sourceRef: string; status: string; scopeIds: string[] }[];
  snapshotCount: number;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter((v): v is UnknownRecord => Boolean(v) && typeof v === "object" && !Array.isArray(v)) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && Boolean(v.trim())) : [];
}

function iso(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim() || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

function safeJsonRecord(value: unknown): Record<string, JsonValue> {
  return record(value) as Record<string, JsonValue>;
}

function isWiki(provider: string, ref: string, kind = ""): boolean {
  const text = `${provider} ${ref} ${kind}`.toLowerCase();
  return text.includes("wiki") || ref.startsWith("ke://wiki/");
}

function rootFor(ref: string, derivative: boolean, declared: string[]): string[] {
  if (declared.length) return [...new Set(declared)].sort();
  return derivative ? [] : [ref];
}

export async function loadBootstrapCorpus(): Promise<BootstrapCorpus> {
  const [sources, contextDocs, snapshots, scopes, registrations] = await Promise.all([
    prisma.source.findMany({
      select: { id: true, kind: true, title: true, content: true, createdAt: true, scope: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contextDoc.findMany({
      select: { id: true, label: true, content: true, createdAt: true, scope: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contextSnapshot.findMany({
      select: { id: true, package: true, createdAt: true, scope: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.scope.findMany({ select: { id: true, name: true, projectNames: true } }),
    prisma.sourceRegistration.findMany({ select: { sourceType: true, sourceRef: true, status: true, scopeIds: true } }),
  ]);

  const artifacts = new Map<string, CorpusArtifact>();
  const evidence = new Map<string, CorpusEvidence>();
  const intelligence = new Map<string, CorpusIntelligence>();
  const derivedClaims = new Map<string, BootstrapCorpus["derivedClaims"][number]>();

  for (const source of sources) {
    const ref = `signal://source/${source.id}`;
    artifacts.set(ref, {
      id: stableId("artifact", ref), provider: "signal-source-store", kind: source.kind,
      title: source.title, canonicalRef: ref, deepLink: `/audit/${source.id}`,
      observedAt: source.createdAt.toISOString(), text: source.content.slice(0, 100_000),
      derivative: false, lineageRootIds: [ref], scopeLabel: source.scope?.name,
    });
  }

  for (const doc of contextDocs) {
    const ref = `signal://context-doc/${doc.id}`;
    artifacts.set(ref, {
      id: stableId("artifact", ref), provider: "signal-context", kind: "context_document",
      title: doc.label, canonicalRef: ref, observedAt: doc.createdAt.toISOString(),
      text: doc.content.slice(0, 100_000), derivative: false, lineageRootIds: [ref], scopeLabel: doc.scope.name,
    });
  }

  for (const snapshot of snapshots) {
    const pkg = record(snapshot.package);
    const sourceByRef = new Map<string, CorpusArtifact>();
    for (const source of records(pkg.sources)) {
      const ref = typeof source.sourceRef === "string" ? source.sourceRef : `snapshot://${snapshot.id}/source`;
      const provider = typeof source.sourceType === "string" ? source.sourceType : "context-package";
      const derivative = isWiki(provider, ref);
      const extra = record(source.extra);
      const declaredRoots = strings(extra.lineageRootIds);
      const artifact: CorpusArtifact = {
        id: stableId("artifact", ref), provider, kind: provider,
        title: typeof source.title === "string" ? source.title : ref,
        canonicalRef: ref,
        deepLink: typeof extra.deepLink === "string" ? extra.deepLink : undefined,
        observedAt: iso(source.observedAt) ?? snapshot.createdAt.toISOString(), text: "",
        derivative, lineageRootIds: rootFor(ref, derivative, declaredRoots), scopeLabel: snapshot.scope.name,
      };
      if (!artifacts.has(ref)) artifacts.set(ref, artifact);
      sourceByRef.set(ref, artifacts.get(ref)!);
    }

    const evidenceMap = new Map<string, string>();
    for (const item of records(pkg.evidence)) {
      if (typeof item.id !== "string" || typeof item.excerpt !== "string") continue;
      const sourceRef = typeof item.sourceRef === "string" ? item.sourceRef : `snapshot://${snapshot.id}`;
      let artifact = sourceByRef.get(sourceRef) ?? artifacts.get(sourceRef);
      if (!artifact) {
        const derivative = isWiki("context-package", sourceRef, String(item.kind ?? ""));
        artifact = {
          id: stableId("artifact", sourceRef), provider: "context-package", kind: String(item.kind ?? "evidence_source"),
          title: sourceRef, canonicalRef: sourceRef, observedAt: snapshot.createdAt.toISOString(), text: "",
          derivative, lineageRootIds: rootFor(sourceRef, derivative, []), scopeLabel: snapshot.scope.name,
        };
        artifacts.set(sourceRef, artifact);
      }
      const extra = record(item.extra);
      const independence = item.independence === "independent" || item.independence === "derivative"
        ? item.independence
        : artifact.derivative ? "derivative" : "unknown";
      const declaredRoots = strings(extra.lineageRootIds);
      const roots = rootFor(sourceRef, independence === "derivative", declaredRoots.length ? declaredRoots : artifact.lineageRootIds);
      const id = stableId("evidence", { sourceRef, producerId: item.id, excerpt: item.excerpt });
      evidenceMap.set(item.id, id);
      if (!evidence.has(id)) {
        evidence.set(id, {
          id, artifactId: artifact.id, exactQuote: item.excerpt.slice(0, 2000),
          locator: {
            ...(typeof item.externalRef === "string" ? { externalRef: item.externalRef } : {}),
            producerEvidenceId: item.id,
            ...safeJsonRecord(item.data),
            ...safeJsonRecord(item.extra),
          },
          occurredAt: iso(item.observedAt) ?? iso(extra.occurredAt), independence, lineageRootIds: roots,
        });
      }
    }

    const rawRelations = records(pkg.intelligenceRelations);
    const contradicted = new Map<string, string[]>();
    const supersedes = new Map<string, string[]>();
    for (const rel of rawRelations) {
      const from = typeof rel.from === "string" ? rel.from : typeof rel.sourceId === "string" ? rel.sourceId : "";
      const to = typeof rel.to === "string" ? rel.to : typeof rel.targetId === "string" ? rel.targetId : "";
      const kind = typeof rel.rel === "string" ? rel.rel : typeof rel.relation === "string" ? rel.relation : "";
      if (!from || !to) continue;
      if (kind === "contradicts") {
        contradicted.set(from, [...(contradicted.get(from) ?? []), to]);
        contradicted.set(to, [...(contradicted.get(to) ?? []), from]);
      }
      if (kind === "supersedes" || kind === "resolves") supersedes.set(from, [...(supersedes.get(from) ?? []), to]);
    }

    for (const item of records(pkg.intelligenceObjects)) {
      if (typeof item.id !== "string" || typeof item.statement !== "string") continue;
      if (intelligence.has(item.id)) continue; // snapshots are newest-first
      intelligence.set(item.id, {
        id: item.id, type: typeof item.intelligenceType === "string" ? item.intelligenceType : "Observation",
        statement: item.statement, isCurrent: item.isCurrent === true,
        status: typeof item.status === "string" ? item.status : undefined,
        observedDate: iso(item.observedDate), fields: safeJsonRecord(item.fields),
        evidenceRefs: strings(item.evidenceRefs).map((id) => evidenceMap.get(id) ?? id),
        supersedes: supersedes.get(item.id) ?? [], contradictedBy: contradicted.get(item.id) ?? [],
        provenance: { ...safeJsonRecord(item.provenance), sourceSnapshotId: snapshot.id }, sourceSnapshotId: snapshot.id,
      });
    }

    for (const claim of records(pkg.derivedClaims)) {
      if (typeof claim.id !== "string" || typeof claim.kind !== "string" || typeof claim.statement !== "string") continue;
      const key = `${snapshot.scope.name}:${claim.id}`;
      if (derivedClaims.has(key)) continue;
      derivedClaims.set(key, {
        id: claim.id, kind: claim.kind, statement: claim.statement,
        evidenceRefs: strings(claim.evidenceRefs).map((id) => evidenceMap.get(id) ?? id),
        extra: safeJsonRecord(claim.extra), sourceSnapshotId: snapshot.id,
      });
    }
  }

  return {
    artifacts: [...artifacts.values()], evidence: [...evidence.values()], intelligence: [...intelligence.values()],
    derivedClaims: [...derivedClaims.values()], activeIdentities: scopes,
    registrations: registrations.map((r) => ({ ...r })), snapshotCount: snapshots.length,
  };
}

interface RetrievalHit {
  id: string;
  type: "artifact" | "intelligence" | "claim";
  exact: boolean;
  score: number;
  reasons: MatchReason[];
}

function queries(identity: ProjectIdentityQuery): string[] {
  return [...new Set([identity.canonicalName, ...identity.aliases].map((s) => normalizeSearchText(s)).filter(Boolean))];
}

function exactContains(text: string, query: string): boolean {
  const haystack = ` ${normalizeSearchText(text)} `;
  return haystack.includes(` ${query} `);
}

function retrieve(identity: ProjectIdentityQuery, corpus: BootstrapCorpus): Map<string, RetrievalHit> {
  const docs = [
    ...corpus.artifacts.map((a) => ({ id: `artifact:${a.id}`, ref: a.id, type: "artifact" as const, title: a.title, body: a.text, scope: a.scopeLabel ?? "" })),
    ...corpus.intelligence.map((i) => ({ id: `intelligence:${i.id}`, ref: i.id, type: "intelligence" as const, title: i.statement, body: JSON.stringify(i.fields), scope: "" })),
    ...corpus.derivedClaims.map((c) => ({ id: `claim:${c.sourceSnapshotId}:${c.id}`, ref: `${c.sourceSnapshotId}:${c.id}`, type: "claim" as const, title: c.statement, body: JSON.stringify(c.extra), scope: "" })),
  ];
  const mini = new MiniSearch<{ ref: string; type: string }>({
    fields: ["title", "body", "scope"], storeFields: ["ref", "type"],
    tokenize: (text) => normalizeSearchText(text).split(" ").filter(Boolean), processTerm: (term) => term,
  });
  mini.addAll(docs);
  const found = new Map<string, RetrievalHit>();
  for (const query of queries(identity)) {
    for (const doc of docs) {
      const exact = exactContains(`${doc.title} ${doc.body} ${doc.scope}`, query);
      if (!exact) continue;
      const key = `${doc.type}:${doc.ref}`;
      found.set(key, {
        id: doc.ref, type: doc.type, exact: true, score: Math.max(found.get(key)?.score ?? 0, 100),
        reasons: [{ kind: "exact_identity", detail: `Exact identity match for “${query}”` }],
      });
    }
    const results = mini.search(query, { combineWith: "AND", prefix: prefixFor, fuzzy: fuzzinessFor, boost: { title: 2, scope: 1.5, body: 1 } });
    for (const result of results.slice(0, 80)) {
      const type = result.type as RetrievalHit["type"];
      const key = `${type}:${String(result.ref)}`;
      const existing = found.get(key);
      if (existing?.exact) continue;
      found.set(key, {
        id: String(result.ref), type, exact: false, score: Math.max(existing?.score ?? 0, result.score),
        reasons: [{ kind: "lexical", detail: `Lexical match for “${query}”`, terms: result.terms }],
      });
    }
  }
  return found;
}

function excerpt(text: string, identity: ProjectIdentityQuery): string | null {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();
  const needles = [identity.canonicalName, ...identity.aliases].map((v) => v.trim().toLowerCase()).filter(Boolean);
  const positions = needles.map((n) => lower.indexOf(n)).filter((n) => n >= 0);
  const at = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, at - 180);
  const end = Math.min(clean.length, at + 420);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
}

function currentness(date: string | undefined, generatedAt: Date): BootstrapProposal["currentness"] {
  if (!date) return "unknown";
  const age = Math.max(0, (generatedAt.getTime() - new Date(date).getTime()) / 86_400_000);
  if (age <= 45) return "current";
  if (age <= 180) return "aging";
  return "stale";
}

function candidateKey(kind: string, title: string): string {
  return stableId(kind, normalizeSearchText(title), 24);
}

function proposal(
  input: Omit<BootstrapProposal, "proposalId" | "candidateKey" | "fingerprint" | "grounding">,
  evidenceById: Map<string, BootstrapEvidencePassage>,
  contradiction = false
): BootstrapProposal {
  const linked = input.evidenceRefs.map((id) => evidenceById.get(id)).filter((v): v is BootstrapEvidencePassage => Boolean(v));
  const independentRoots = new Set(linked.flatMap((e) => e.independence === "derivative" ? [] : e.lineageRootIds));
  const derivativeOnly = linked.length > 0 && linked.every((e) => e.independence === "derivative");
  const key = candidateKey(input.kind, input.title);
  const fingerprint = bootstrapHash({ kind: input.kind, payload: input.payload, independentRoots: [...independentRoots].sort() });
  return {
    ...input, proposalId: stableId("proposal", { key, fingerprint }), candidateKey: key, fingerprint,
    grounding: {
      directEvidenceCount: linked.filter((e) => e.independence !== "derivative").length,
      independentLineageRootCount: independentRoots.size, derivativeOnly, unresolvedContradiction: contradiction,
    },
  };
}

function firstString(fields: Record<string, JsonValue>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function peopleFrom(fields: Record<string, JsonValue>): string[] {
  const keys = ["owner", "owners", "assignee", "assignees", "person", "people", "decision_owner"];
  const out: string[] = [];
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === "string") out.push(value);
    if (Array.isArray(value)) out.push(...value.filter((v): v is string => typeof v === "string"));
  }
  return [...new Set(out.map((v) => v.trim()).filter(Boolean))];
}

function proposalFromIntelligence(
  head: BootstrapIntelligenceHead,
  generatedAt: Date,
  evidenceById: Map<string, BootstrapEvidencePassage>
): BootstrapProposal[] {
  const type = head.type.toLowerCase().replace(/[_ -]+/g, "");
  const common = {
    statement: head.statement, evidenceRefs: head.evidenceRefs, intelligenceRefs: [head.intelligenceId],
    relevance: "high" as const, currentness: currentness(head.observedDate, generatedAt),
    matchBasis: "current structured intelligence",
  };
  const result: BootstrapProposal[] = [];
  for (const person of peopleFrom(head.fields)) {
    result.push(proposal({ ...common, kind: "person", title: person,
      whyProposed: "Named in a structured intelligence owner/person field; this is a mention, not staffing.",
      payload: { displayLabel: person, staffingEffect: false, sourceIntelligenceId: head.intelligenceId },
    }, evidenceById, head.contradictedBy.length > 0));
  }
  if (type === "decision") {
    const title = firstString(head.fields, ["question", "decision", "title"]) ?? head.statement;
    result.push(proposal({ ...common, kind: "decision", title,
      whyProposed: "A current external Decision object matched the requested project identity.",
      payload: { question: title, ownerHint: firstString(head.fields, ["owner", "decision_owner"]) ?? null, createsGate: false },
    }, evidenceById, head.contradictedBy.length > 0));
  } else if (type === "dependency") {
    const from = firstString(head.fields, ["from", "dependent", "subject", "project"]);
    const to = firstString(head.fields, ["to", "prerequisite", "depends_on", "dependency"]);
    if (from && to) {
      result.push(proposal({ ...common, kind: "dependency", title: `${from} → ${to}`,
        whyProposed: "A structured Dependency supplied both endpoints. Direction remains subject to review.",
        payload: { fromEntity: from, toEntity: to, relationshipKind: "depends_on", assertionBasis: head.statement },
      }, evidenceById, head.contradictedBy.length > 0));
    }
  } else if (type === "risk") {
    result.push(proposal({ ...common, kind: "risk", title: head.statement,
      whyProposed: "A current external Risk object matched the requested identity.",
      payload: { statement: head.statement, sourceIntelligenceId: head.intelligenceId },
    }, evidenceById, head.contradictedBy.length > 0));
  } else if (type === "unknown") {
    result.push(proposal({ ...common, kind: "unknown", title: firstString(head.fields, ["question"]) ?? head.statement,
      whyProposed: "A current external Unknown object matched the requested identity.",
      payload: { question: firstString(head.fields, ["question"]) ?? head.statement, sourceIntelligenceId: head.intelligenceId },
    }, evidenceById, head.contradictedBy.length > 0));
  } else if (type === "commitment") {
    const date = firstString(head.fields, ["due_date", "dueDate", "date", "target_date"]);
    if (date && !Number.isNaN(Date.parse(date))) {
      result.push(proposal({ ...common, kind: "milestone", title: firstString(head.fields, ["action", "title"]) ?? head.statement,
        whyProposed: "A structured Commitment included an explicit date. It remains a candidate, not a promise.",
        payload: { title: firstString(head.fields, ["action", "title"]) ?? head.statement, date: new Date(date).toISOString(), planningState: "candidate" },
      }, evidenceById, head.contradictedBy.length > 0));
    }
  } else if (type === "opportunity") {
    const name = firstString(head.fields, ["capability", "feature", "name", "title"]);
    if (name) {
      result.push(proposal({ ...common, kind: "capability", title: name,
        whyProposed: "A matched external Opportunity named a capability explicitly.",
        payload: { name, intent: head.statement, executionLink: null },
      }, evidenceById, head.contradictedBy.length > 0));
    }
  }
  return result;
}

function claimProposal(
  claim: BootstrapCorpus["derivedClaims"][number],
  evidenceById: Map<string, BootstrapEvidencePassage>
): BootstrapProposal | null {
  const type = claim.kind.toLowerCase().replace(/[_ -]+/g, "");
  const common = {
    statement: claim.statement, title: claim.statement, evidenceRefs: claim.evidenceRefs,
    intelligenceRefs: [] as string[], relevance: "medium" as const, currentness: "unknown" as const,
    matchBasis: "typed derived claim", whyProposed: `A stored package supplied an explicit ${claim.kind} claim.`,
  };
  if (["capability", "scope", "requirement"].includes(type)) {
    return proposal({ ...common, kind: "capability", payload: { name: claim.statement, intent: claim.statement, executionLink: null } }, evidenceById);
  }
  if (type === "decision") {
    return proposal({ ...common, kind: "decision", payload: { question: claim.statement, createsGate: false } }, evidenceById);
  }
  if (["event", "milestone", "kickoff", "delivery"].includes(type)) {
    const date = typeof claim.extra.date === "string" && !Number.isNaN(Date.parse(claim.extra.date)) ? claim.extra.date : null;
    return proposal({ ...common, kind: "milestone", payload: { title: claim.statement, date, planningState: "candidate" } }, evidenceById);
  }
  if (type === "risk") return proposal({ ...common, kind: "risk", payload: { statement: claim.statement } }, evidenceById);
  if (type === "unknown") return proposal({ ...common, kind: "unknown", payload: { question: claim.statement } }, evidenceById);
  return null;
}

export function compileBootstrapPackage(
  bootstrapId: string,
  identity: ProjectIdentityQuery,
  corpus: BootstrapCorpus,
  generatedAt = new Date()
): ProjectBootstrapPackageV1 {
  const hits = retrieve(identity, corpus);
  const artifactById = new Map(corpus.artifacts.map((a) => [a.id, a]));
  const evidenceByArtifact = new Map<string, CorpusEvidence[]>();
  for (const item of corpus.evidence) evidenceByArtifact.set(item.artifactId, [...(evidenceByArtifact.get(item.artifactId) ?? []), item]);

  const artifacts: BootstrapArtifact[] = [];
  const evidence: BootstrapEvidencePassage[] = [];
  const evidenceSeen = new Set<string>();
  for (const hit of hits.values()) {
    if (hit.type !== "artifact") continue;
    const artifact = artifactById.get(hit.id);
    if (!artifact) continue;
    artifacts.push({
      artifactId: artifact.id, provider: artifact.provider, artifactType: artifact.kind, title: artifact.title,
      canonicalRef: artifact.canonicalRef, ...(artifact.deepLink ? { deepLink: artifact.deepLink } : {}),
      ...(artifact.observedAt ? { observedAt: artifact.observedAt } : {}), availability: "available",
      retrievalReasons: hit.reasons, relevanceBand: hit.exact ? "included" : "possible",
      lineageRootIds: artifact.lineageRootIds, derivativeOfArtifactIds: artifact.derivative ? artifact.lineageRootIds : [],
    });
    const transported = evidenceByArtifact.get(artifact.id) ?? [];
    for (const item of transported) {
      const matched = queries(identity).some((q) => exactContains(item.exactQuote, q));
      if (!matched && !hit.exact) continue;
      if (evidenceSeen.has(item.id)) continue;
      evidenceSeen.add(item.id);
      evidence.push({
        evidenceId: item.id, artifactId: item.artifactId, exactQuote: item.exactQuote,
        locator: item.locator, ...(item.occurredAt ? { occurredAt: item.occurredAt } : {}),
        independence: item.independence, lineageRootIds: item.lineageRootIds,
      });
    }
    if (transported.length === 0) {
      const quote = excerpt(artifact.text, identity);
      if (quote) {
        const id = stableId("evidence", { artifact: artifact.id, quote });
        evidenceSeen.add(id);
        evidence.push({
          evidenceId: id, artifactId: artifact.id, exactQuote: quote,
          locator: { stableRef: artifact.canonicalRef, locatorLimitation: "Signal stores no character-offset index for this source." },
          independence: artifact.derivative ? "derivative" : "independent", lineageRootIds: artifact.lineageRootIds,
        });
      }
    }
  }

  const evidenceById = new Map(evidence.map((e) => [e.evidenceId, e]));
  const intelligenceHeads: BootstrapIntelligenceHead[] = [];
  for (const hit of hits.values()) {
    if (hit.type !== "intelligence") continue;
    const source = corpus.intelligence.find((i) => i.id === hit.id);
    if (!source || !source.isCurrent) continue;
    const availableRefs = source.evidenceRefs.filter((id) => {
      if (evidenceById.has(id)) return true;
      const raw = corpus.evidence.find((e) => e.id === id);
      if (!raw) return false;
      const artifact = artifactById.get(raw.artifactId);
      if (artifact && !artifacts.some((a) => a.artifactId === artifact.id)) {
        artifacts.push({
          artifactId: artifact.id, provider: artifact.provider, artifactType: artifact.kind, title: artifact.title,
          canonicalRef: artifact.canonicalRef, ...(artifact.deepLink ? { deepLink: artifact.deepLink } : {}),
          ...(artifact.observedAt ? { observedAt: artifact.observedAt } : {}), availability: "available",
          retrievalReasons: [{ kind: "current_head", detail: `Evidence for current intelligence ${source.id}` }], relevanceBand: "included",
          lineageRootIds: artifact.lineageRootIds, derivativeOfArtifactIds: artifact.derivative ? artifact.lineageRootIds : [],
        });
      }
      evidenceById.set(raw.id, {
        evidenceId: raw.id, artifactId: raw.artifactId, exactQuote: raw.exactQuote, locator: raw.locator,
        ...(raw.occurredAt ? { occurredAt: raw.occurredAt } : {}), independence: raw.independence, lineageRootIds: raw.lineageRootIds,
      });
      evidence.push(evidenceById.get(raw.id)!);
      return true;
    });
    intelligenceHeads.push({
      intelligenceId: source.id, type: source.type, statement: source.statement, isCurrent: source.isCurrent,
      ...(source.status ? { status: source.status } : {}), ...(source.observedDate ? { observedDate: source.observedDate } : {}),
      fields: source.fields, evidenceRefs: availableRefs, supersedes: source.supersedes,
      contradictedBy: source.contradictedBy, provenance: source.provenance,
    });
  }

  const proposals: BootstrapProposal[] = [];
  for (const artifact of artifacts) {
    const refs = evidence.filter((e) => e.artifactId === artifact.artifactId).map((e) => e.evidenceId);
    proposals.push(proposal({
      kind: "source", title: artifact.title, statement: artifact.title,
      whyProposed: artifact.retrievalReasons[0]?.detail ?? "Matched requested identity.", matchBasis: artifact.retrievalReasons[0]?.kind ?? "lexical",
      evidenceRefs: refs, intelligenceRefs: [], relevance: artifact.relevanceBand === "included" ? "high" : "medium",
      currentness: currentness(artifact.observedAt, generatedAt),
      payload: { artifactId: artifact.artifactId, provider: artifact.provider, canonicalRef: artifact.canonicalRef, derivative: artifact.derivativeOfArtifactIds.length > 0 },
    }, evidenceById));
  }
  for (const head of intelligenceHeads) proposals.push(...proposalFromIntelligence(head, generatedAt, evidenceById));
  for (const hit of hits.values()) {
    if (hit.type !== "claim") continue;
    const claim = corpus.derivedClaims.find((c) => `${c.sourceSnapshotId}:${c.id}` === hit.id);
    if (!claim) continue;
    const compiled = claimProposal(claim, evidenceById);
    if (compiled) proposals.push(compiled);
  }

  const deduped = new Map<string, BootstrapProposal>();
  for (const item of proposals) {
    const prior = deduped.get(item.candidateKey);
    if (!prior || item.grounding.directEvidenceCount > prior.grounding.directEvidenceCount) deduped.set(item.candidateKey, item);
  }

  const ambiguities: BootstrapAmbiguity[] = [];
  const identityNames = queries(identity);
  for (const scope of corpus.activeIdentities) {
    const names = [scope.name, ...scope.projectNames].map(normalizeSearchText);
    const exact = identityNames.find((name) => names.includes(name));
    if (exact) ambiguities.push({
      id: stableId("ambiguity", { scope: scope.id, exact }), kind: "identity_collision", severity: "blocking",
      summary: `“${exact}” already identifies active Scope ${scope.name}.`, refs: [scope.id],
    });
  }
  for (const head of intelligenceHeads.filter((h) => h.contradictedBy.length > 0)) {
    ambiguities.push({
      id: stableId("ambiguity", { head: head.intelligenceId, refs: head.contradictedBy }), kind: "contradiction", severity: "notice",
      summary: `${head.type} ${head.intelligenceId} has a contradiction relation.`, refs: [head.intelligenceId, ...head.contradictedBy],
    });
  }
  for (const alias of identity.aliases.filter((a) => normalizeSearchText(a).length <= 3)) {
    const count = [...hits.values()].filter((h) => h.exact).length;
    if (count > 8) ambiguities.push({
      id: stableId("ambiguity", { alias, count }), kind: "alias_collision", severity: "notice",
      summary: `Short alias “${alias}” matched ${count} records and may include unrelated material.`, refs: [],
    });
  }

  const matchedProviders = new Map<string, number>();
  for (const artifact of artifacts) matchedProviders.set(artifact.provider, (matchedProviders.get(artifact.provider) ?? 0) + 1);
  const hermesArtifacts = artifacts.filter((a) => a.canonicalRef.startsWith("ke://") || a.provider.includes("hermes"));
  const wikiArtifacts = artifacts.filter((a) => isWiki(a.provider, a.canonicalRef, a.artifactType));
  const coverage: ProviderCoverage[] = [
    { provider: "signal-source-store", label: "Signal sources", state: "available", artifacts: matchedProviders.get("signal-source-store") ?? 0, detail: "Searched persisted Source rows with exact and lexical matching." },
    { provider: "signal-context", label: "Signal context", state: "available", artifacts: (matchedProviders.get("signal-context") ?? 0) + (matchedProviders.get("context-package") ?? 0), detail: `Searched ContextDocs and ${corpus.snapshotCount} stored context packages.` },
    { provider: "hermes", label: "Hermes / structured intelligence", state: hermesArtifacts.length || intelligenceHeads.length ? "partial" : "not_configured", artifacts: hermesArtifacts.length, detail: hermesArtifacts.length || intelligenceHeads.length ? "Stored push packages searched; Signal has no live Hermes pull or health endpoint." : "No matching stored Hermes package. The current bridge requires an active Scope and cannot scan pre-Reality identities." },
    { provider: "wiki", label: "Derivative wiki", state: wikiArtifacts.length ? "partial" : "not_configured", artifacts: wikiArtifacts.length, detail: wikiArtifacts.length ? "Stored wiki-derived material searched; live wiki access is not configured in Signal." : "No live wiki connector exists in Signal." },
    { provider: "notion", label: "Notion", state: "not_configured", artifacts: artifacts.filter((a) => a.provider.toLowerCase().includes("notion")).length, detail: "Bootstrap has no active Scope source bindings; live Notion collection is not run." },
    { provider: "figma", label: "Figma", state: "not_configured", artifacts: artifacts.filter((a) => a.provider.toLowerCase().includes("figma")).length, detail: "Bootstrap has no active Scope source bindings; live Figma collection is not run." },
    { provider: "linear", label: "Linear", state: "not_configured", artifacts: 0, detail: "Execution configuration belongs to active Scope and is intentionally absent before activation." },
  ];

  const gaps: BootstrapGap[] = [];
  const kinds = new Set([...deduped.values()].map((p) => p.kind));
  if (!kinds.has("capability")) gaps.push({ id: "gap-scope", category: "Proposed Scope", summary: "Insufficient evidence to establish scope", detail: "No matched typed claim or current intelligence object explicitly named a capability." });
  if (!intelligenceHeads.length) gaps.push({ id: "gap-heads", category: "Structured intelligence", summary: "No matching current intelligence heads", detail: "Signal searched stored packages only; a generic pre-Scope Hermes compiler is not available." });
  if (!artifacts.length) gaps.push({ id: "gap-corpus", category: "Sources", summary: "No matching persisted artifacts", detail: "This is an honest sparse result, not evidence that no project history exists." });
  if (!kinds.has("dependency")) gaps.push({ id: "gap-dependency", category: "Dependencies", summary: "No causally structured dependency", detail: "Semantic or lexical relatedness alone is not treated as dependency direction." });

  for (const gap of gaps) {
    const item = proposal({
      kind: "missing_information", title: gap.summary, statement: gap.detail,
      whyProposed: `The ${gap.category} scan stage could not establish this from available knowledge.`,
      matchBasis: "coverage gap", evidenceRefs: [], intelligenceRefs: [], relevance: "high",
      currentness: "unknown", payload: { gapId: gap.id, category: gap.category, detail: gap.detail },
    }, evidenceById);
    deduped.set(item.candidateKey, item);
  }

  const packageSeed = {
    version: BOOTSTRAP_PACKAGE_VERSION, producer: "gap_app" as const, compilerVersion: BOOTSTRAP_COMPILER_VERSION,
    bootstrapId, requestedIdentity: identity,
    discovery: {
      strategies: [
        { id: "identity", state: "complete" as const, detail: "Canonical name and aliases checked exactly." },
        { id: "lexical", state: "complete" as const, detail: "MiniSearch token/prefix/fuzzy retrieval over Signal-held knowledge." },
        { id: "lineage", state: evidence.length ? "complete" as const : "partial" as const, detail: evidence.length ? "Available evidence/source lineage retained." : "No matching evidence passage was available." },
        { id: "semantic", state: "unavailable" as const, detail: "Semantic Search V2 is not enabled; no vector search was claimed." },
        { id: "graph", state: intelligenceHeads.length ? "partial" as const : "unavailable" as const, detail: intelligenceHeads.length ? "Bounded contradiction/supersession relations were retained for matched heads." : "No matching stored structured graph was available." },
        { id: "compile", state: "complete" as const, detail: "Only typed deterministic rules emitted candidates." },
      ],
      partial: coverage.some((c) => c.state !== "available"),
    },
    artifacts: artifacts.sort((a, b) => a.artifactId.localeCompare(b.artifactId)),
    evidence: evidence.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)),
    intelligenceHeads: intelligenceHeads.sort((a, b) => a.intelligenceId.localeCompare(b.intelligenceId)),
    proposals: [...deduped.values()].sort((a, b) => a.candidateKey.localeCompare(b.candidateKey)),
    coverage, ambiguities, gaps,
    warnings: [
      "This package is pre-Reality. Candidate dispositions have zero Forecast effect.",
      "Coverage is limited to knowledge already persisted in Signal; live provider collection was not attempted.",
    ],
  };
  const contentHash = bootstrapHash(packageSeed);
  const result: ProjectBootstrapPackageV1 = {
    ...packageSeed, packageId: `gap-bootstrap-${contentHash.slice(0, 32)}`, generatedAt: generatedAt.toISOString(),
  };
  return result;
}

function emptyJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function executeBootstrapScan(scanRunId: string): Promise<void> {
  const scan = await prisma.bootstrapScanRun.findUnique({ where: { id: scanRunId }, include: { bootstrap: true } });
  if (!scan) return;
  try {
    await prisma.bootstrapScanRun.update({
      where: { id: scan.id }, data: { status: "running", stage: "identity", startedAt: scan.startedAt ?? new Date(), error: null },
    });
    await prisma.projectBootstrap.update({ where: { id: scan.bootstrapId }, data: { status: "scanning" } });
    const corpus = await loadBootstrapCorpus();
    await prisma.bootstrapScanRun.update({ where: { id: scan.id }, data: { stage: "lexical_retrieval" } });
    const identity: ProjectIdentityQuery = {
      canonicalName: scan.bootstrap.canonicalName, aliases: scan.bootstrap.aliases,
      ...(scan.bootstrap.ownerHint ? { ownerHint: scan.bootstrap.ownerHint } : {}),
      sourceHints: strings(scan.bootstrap.sourceHints),
    };
    const compiled = scan.bootstrap.searchExistingKnowledge
      ? compileBootstrapPackage(scan.bootstrapId, identity, corpus)
      : compileBootstrapPackage(scan.bootstrapId, identity, { ...corpus, artifacts: [], evidence: [], intelligence: [], derivedClaims: [], snapshotCount: 0 });
    await prisma.bootstrapScanRun.update({ where: { id: scan.id }, data: { stage: "proposal_compilation" } });
    await persistCompiledPackage(scan.id, compiled);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bootstrap scan failed";
    await prisma.$transaction([
      prisma.bootstrapScanRun.update({ where: { id: scanRunId }, data: { status: "failed", stage: "failed", error: message, completedAt: new Date() } }),
      prisma.projectBootstrap.update({ where: { id: scan.bootstrapId }, data: { status: "scan_failed" } }),
    ]);
  }
}

export async function persistCompiledPackage(scanRunId: string, compiled: ProjectBootstrapPackageV1): Promise<void> {
  const fullHash = bootstrapHash(compiled);
  const existing = await prisma.bootstrapPackage.findUnique({
    where: { producer_packageId: { producer: compiled.producer, packageId: compiled.packageId } },
  });
  if (existing) {
    const current = await prisma.projectBootstrap.findUnique({ where: { id: compiled.bootstrapId }, select: { activePackageId: true } });
    const switchingPackage = current?.activePackageId !== existing.id;
    await prisma.$transaction([
      ...(switchingPackage ? [
        prisma.bootstrapCandidate.updateMany({ where: { bootstrapId: compiled.bootstrapId, packageId: { not: null } }, data: { active: false } }),
        prisma.bootstrapCandidate.updateMany({ where: { packageId: existing.id }, data: { active: true } }),
      ] : []),
      prisma.projectBootstrap.update({ where: { id: compiled.bootstrapId }, data: {
        activePackageId: existing.id, status: "reviewing", ...(switchingPackage ? { reviewRevision: { increment: 1 } } : {}),
      } }),
      prisma.bootstrapScanRun.update({
        where: { id: scanRunId }, data: {
          status: "complete", stage: "complete", resultPackageId: existing.id, completedAt: new Date(),
          providerCoverage: emptyJson(compiled.coverage),
          metrics: emptyJson({ providersChecked: compiled.coverage.length, artifactsFound: compiled.artifacts.length, intelligenceHeads: compiled.intelligenceHeads.length, evidencePassages: compiled.evidence.length, proposals: compiled.proposals.length }),
          warnings: emptyJson(compiled.warnings),
        },
      }),
    ]);
    return;
  }

  const previous = await prisma.bootstrapPackage.findFirst({ where: { bootstrapId: compiled.bootstrapId }, orderBy: { createdAt: "desc" } });
  const candidateHistory = await prisma.bootstrapCandidate.findMany({
    where: { bootstrapId: compiled.bootstrapId, packageId: { not: null } }, orderBy: { createdAt: "desc" }, include: { evidenceLinks: true },
  });
  const historyByKey = new Map<string, typeof candidateHistory>();
  for (const candidate of candidateHistory) historyByKey.set(candidate.candidateKey, [...(historyByKey.get(candidate.candidateKey) ?? []), candidate]);

  await prisma.$transaction(async (tx) => {
    await tx.bootstrapCandidate.updateMany({ where: { bootstrapId: compiled.bootstrapId, packageId: { not: null } }, data: { active: false } });
    const packageRow = await tx.bootstrapPackage.create({ data: {
      bootstrapId: compiled.bootstrapId, scanRunId, packageId: compiled.packageId,
      packageVersion: compiled.version, producer: compiled.producer, compilerVersion: compiled.compilerVersion,
      packageHash: fullHash, package: emptyJson(compiled), generatedAt: new Date(compiled.generatedAt), supersedesPackageId: previous?.id,
    } });
    for (const item of compiled.proposals) {
      const history = historyByKey.get(item.candidateKey) ?? [];
      const prior = history.find((candidate) => candidate.sourceFingerprint === item.fingerprint) ?? history[0];
      const refresh = resolveRefreshDisposition(prior, item.fingerprint);
      const row = await tx.bootstrapCandidate.create({ data: {
        bootstrapId: compiled.bootstrapId, packageId: packageRow.id, candidateKey: item.candidateKey,
        kind: item.kind, title: item.title, summary: item.statement, whyProposed: item.whyProposed,
        matchBasis: item.matchBasis, currentness: item.currentness, relevance: item.relevance,
        sourceFingerprint: item.fingerprint, originalProposal: emptyJson(item),
        reviewedProposal: refresh.reviewedProposal ? (refresh.reviewedProposal as Prisma.InputJsonValue) : undefined,
        status: refresh.status, dispositionReason: refresh.dispositionReason,
        changedSincePrior: refresh.changedSincePrior, carriedFromCandidateId: prior?.id,
      } });
      for (const evidenceId of item.evidenceRefs) {
        const previousLink = !refresh.changedSincePrior ? prior?.evidenceLinks.find((l) => l.evidenceId === evidenceId) : undefined;
        await tx.bootstrapEvidenceLink.create({ data: {
          candidateId: row.id, evidenceId, linkState: previousLink?.linkState ?? "attached",
          attachedBy: previousLink?.attachedBy ?? "compiler", reason: previousLink?.reason,
        } });
      }
    }
    await tx.projectBootstrap.update({
      where: { id: compiled.bootstrapId }, data: { activePackageId: packageRow.id, status: "reviewing", reviewRevision: { increment: 1 } },
    });
    await tx.bootstrapScanRun.update({
      where: { id: scanRunId }, data: {
        status: "complete", stage: "complete", resultPackageId: packageRow.id, completedAt: new Date(),
        providerCoverage: emptyJson(compiled.coverage),
        metrics: emptyJson({ providersChecked: compiled.coverage.length, artifactsFound: compiled.artifacts.length, intelligenceHeads: compiled.intelligenceHeads.length, evidencePassages: compiled.evidence.length, proposals: compiled.proposals.length }),
        warnings: emptyJson(compiled.warnings),
      },
    });
  });
}
