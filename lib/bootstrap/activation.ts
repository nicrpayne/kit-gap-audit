import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeSearchText } from "@/lib/audit/searchText";
import { hashProjectContextPackage } from "@/lib/context/hash";
import type { JsonValue, ProjectContextPackage } from "@/lib/context/package";
import type { PolicyEvaluatedCompleteness } from "@/lib/context/sourcePolicy";
import { validateProjectContextPackage } from "@/lib/context/validate";
import { bootstrapHash } from "./hash";
import type { ProjectBootstrapPackageV1 } from "./contracts";

export const ACTIVATION_MANIFEST_VERSION = "1.0" as const;
export const ACTIVATION_CONTEXT_VERSION = "1.1" as const;
export const FIRST_AUDIT_MODEL = "signal-bootstrap-first-audit-1.0" as const;

export type ExecutionState = "configured" | "not_configured" | "unavailable" | "stale";

export interface ActivationRequest {
  expectedRevision: number;
  acknowledgedBlockerIds?: string[];
  acknowledgeProviderGaps?: boolean;
  execution?: {
    state?: ExecutionState;
    teamKey?: string;
    projectNames?: string[];
    labelFilter?: string | null;
    detail?: string | null;
  };
}

export interface ManifestItem {
  candidateId: string;
  kind: string;
  title: string;
  status: string;
  evidenceRefs: string[];
  provenance: Record<string, JsonValue>;
  payload: Record<string, JsonValue>;
  reason?: string;
}

export interface ActivationManifestV1 {
  version: typeof ACTIVATION_MANIFEST_VERSION;
  bootstrapId: string;
  reviewRevision: number;
  projectIdentity: { canonicalName: string; aliases: string[] };
  execution: { state: ExecutionState; teamKey: string | null; projectNames: string[]; labelFilter: string | null; detail: string | null };
  willBecomeCanonical: {
    project: { name: string };
    aliases: string[];
    capabilities: ManifestItem[];
    executionMappings: { candidateId: string; provider: string; externalId: string }[];
    decisions: ManifestItem[];
    dependencies: ManifestItem[];
    milestones: ManifestItem[];
    sourceRegistrations: ManifestItem[];
  };
  willRemainExternal: {
    candidates: ManifestItem[];
    peopleNotStaffing: ManifestItem[];
    semanticRelationsNotDependencies: { sourceId: string; relation: string; targetId: string }[];
    unresolvedAmbiguities: { id: string; kind: string; severity: string; summary: string }[];
    providerGaps: { provider: string; state: string; detail: string }[];
    missingInformation: { id: string; summary: string; detail: string }[];
  };
  blockers: { id: string; summary: string; acknowledged: boolean }[];
  forecast: { state: "ready" | "unavailable"; effectAtActivation: "none"; reason: string };
  warning: "ACTIVATION DOES NOT CERTIFY COMPLETENESS. THE FIRST AUDIT WILL TEST THIS ACCEPTED MODEL AGAINST EXTERNAL EVIDENCE.";
}

type CandidateRow = {
  id: string;
  kind: string;
  title: string;
  status: string;
  operatorAssertion: boolean;
  originalProposal: Prisma.JsonValue;
  reviewedProposal: Prisma.JsonValue | null;
  evidenceLinks: { evidenceId: string; linkState: string }[];
};

type BootstrapForManifest = {
  id: string;
  canonicalName: string;
  aliases: string[];
  ownerHint: string | null;
  reviewRevision: number;
  status: string;
  activePackage: { id: string; packageId: string; scanRunId: string; package: Prisma.JsonValue } | null;
  candidates: CandidateRow[];
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];

function candidatePayload(candidate: CandidateRow): Record<string, JsonValue> {
  if (candidate.reviewedProposal) return record(candidate.reviewedProposal) as Record<string, JsonValue>;
  const original = record(candidate.originalProposal);
  return record(original.payload) as Record<string, JsonValue>;
}

function evidenceRefs(candidate: CandidateRow): string[] {
  const original = record(candidate.originalProposal);
  const declared = strings(original.evidenceRefs);
  const detached = new Set(candidate.evidenceLinks.filter((link) => link.linkState === "detached").map((link) => link.evidenceId));
  const attached = candidate.evidenceLinks.filter((link) => link.linkState === "attached").map((link) => link.evidenceId);
  return [...new Set([...declared.filter((id) => !detached.has(id)), ...attached])].sort();
}

function manifestItem(candidate: CandidateRow): ManifestItem {
  const original = record(candidate.originalProposal);
  return {
    candidateId: candidate.id,
    kind: candidate.kind,
    title: candidate.title,
    status: candidate.status,
    evidenceRefs: evidenceRefs(candidate),
    provenance: {
      boundary: "human_accepted_bootstrap",
      sourceCandidateId: candidate.id,
      sourceFingerprint: typeof original.fingerprint === "string" ? original.fingerprint : null,
      operatorAssertion: candidate.operatorAssertion,
      evidenceRefs: evidenceRefs(candidate),
      basis: candidate.operatorAssertion ? "operator_assertion" : typeof original.basis === "string" ? original.basis : "external_candidate",
      originalAuthorshipPreserved: true,
    },
    payload: candidatePayload(candidate),
  };
}

function executionFor(request: ActivationRequest): ActivationManifestV1["execution"] {
  const state = request.execution?.state ?? "not_configured";
  return {
    state,
    teamKey: state === "configured" ? request.execution?.teamKey?.trim() || null : null,
    projectNames: state === "configured" ? [...new Set(request.execution?.projectNames?.map((item) => item.trim()).filter(Boolean) ?? [])] : [],
    labelFilter: state === "configured" ? request.execution?.labelFilter?.trim() || null : null,
    detail: request.execution?.detail?.trim() || (state === "not_configured" ? "No execution system was configured at activation." : null),
  };
}

function executionLinks(item: ManifestItem): { candidateId: string; provider: string; externalId: string }[] {
  const links = Array.isArray(item.payload.executionLinks) ? item.payload.executionLinks : item.payload.executionLink ? [item.payload.executionLink] : [];
  return links.flatMap((raw) => {
    const link = record(raw);
    return typeof link.provider === "string" && typeof link.externalId === "string" && link.provider.trim() && link.externalId.trim()
      ? [{ candidateId: item.candidateId, provider: link.provider.trim(), externalId: link.externalId.trim() }]
      : [];
  });
}

export function buildActivationManifest(bootstrap: BootstrapForManifest, request: ActivationRequest): ActivationManifestV1 {
  const pkg = bootstrap.activePackage ? bootstrap.activePackage.package as unknown as ProjectBootstrapPackageV1 : null;
  const accepted = bootstrap.candidates.filter((candidate) => candidate.status === "accepted").map(manifestItem);
  const canonicalKinds = new Set(["capability", "decision", "dependency", "milestone", "source"]);
  const canonical = accepted.filter((item) => canonicalKinds.has(item.kind));
  const external = bootstrap.candidates.filter((candidate) => candidate.status !== "accepted" || !canonicalKinds.has(candidate.kind)).map(manifestItem);
  const people = bootstrap.candidates.filter((candidate) => candidate.kind === "person").map((candidate) => ({
    ...manifestItem(candidate), reason: "A person mention is not staffing and creates no Person or Allocation.",
  }));
  const gaps = pkg?.coverage.filter((coverage) => coverage.state !== "available") ?? [];
  const acknowledged = new Set(request.acknowledgedBlockerIds ?? []);
  const blockers = (pkg?.ambiguities ?? []).filter((item) => item.severity === "blocking").map((item) => ({
    id: item.id, summary: item.summary, acknowledged: acknowledged.has(item.id),
  }));
  if (gaps.length && !request.acknowledgeProviderGaps) {
    blockers.push({ id: "provider-gaps", summary: "Provider coverage is partial and must be explicitly acknowledged.", acknowledged: false });
  }
  const execution = executionFor(request);
  if (execution.state === "configured" && !execution.teamKey) {
    blockers.push({ id: "execution-team-key", summary: "Configured execution requires an explicit team key.", acknowledged: false });
  }
  const capabilities = canonical.filter((item) => item.kind === "capability");
  return {
    version: ACTIVATION_MANIFEST_VERSION,
    bootstrapId: bootstrap.id,
    reviewRevision: bootstrap.reviewRevision,
    projectIdentity: { canonicalName: bootstrap.canonicalName, aliases: [...bootstrap.aliases] },
    execution,
    willBecomeCanonical: {
      project: { name: bootstrap.canonicalName }, aliases: [...bootstrap.aliases], capabilities,
      executionMappings: capabilities.flatMap(executionLinks),
      decisions: canonical.filter((item) => item.kind === "decision"),
      dependencies: canonical.filter((item) => item.kind === "dependency"),
      milestones: canonical.filter((item) => item.kind === "milestone"),
      sourceRegistrations: canonical.filter((item) => item.kind === "source"),
    },
    willRemainExternal: {
      candidates: external,
      peopleNotStaffing: people,
      semanticRelationsNotDependencies: (pkg?.relations ?? []).filter((relation) => relation.relation !== "depends_on").map((relation) => ({ sourceId: relation.sourceId, relation: relation.relation, targetId: relation.targetId })),
      unresolvedAmbiguities: (pkg?.ambiguities ?? []).map((item) => ({ id: item.id, kind: item.kind, severity: item.severity, summary: item.summary })),
      providerGaps: gaps.map((item) => ({ provider: item.provider, state: item.state, detail: item.detail })),
      missingInformation: (pkg?.gaps ?? []).map((item) => ({ id: item.id, summary: item.summary, detail: item.detail })),
    },
    blockers,
    forecast: execution.state === "configured" && capabilities.some((item) => executionLinks(item).length > 0)
      ? { state: "ready", effectAtActivation: "none", reason: "Execution is configured; Forecast remains unchanged until its first live read." }
      : { state: "unavailable", effectAtActivation: "none", reason: "Missing executable work mapping." },
    warning: "ACTIVATION DOES NOT CERTIFY COMPLETENESS. THE FIRST AUDIT WILL TEST THIS ACCEPTED MODEL AGAINST EXTERNAL EVIDENCE.",
  };
}

async function readBootstrapForManifest(bootstrapId: string): Promise<BootstrapForManifest | null> {
  const bootstrap = await prisma.projectBootstrap.findUnique({
    where: { id: bootstrapId },
    include: {
      candidates: { where: { active: true }, include: { evidenceLinks: { select: { evidenceId: true, linkState: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!bootstrap) return null;
  const activePackage = bootstrap.activePackageId
    ? await prisma.bootstrapPackage.findUnique({ where: { id: bootstrap.activePackageId }, select: { id: true, packageId: true, scanRunId: true, package: true } })
    : null;
  return { ...bootstrap, activePackage };
}

export async function previewActivationManifest(bootstrapId: string, request: ActivationRequest): Promise<ActivationManifestV1 | null> {
  const bootstrap = await readBootstrapForManifest(bootstrapId);
  return bootstrap ? buildActivationManifest(bootstrap, request) : null;
}

function activationContextPackage(
  scopeId: string,
  bootstrap: BootstrapForManifest,
  manifest: ActivationManifestV1,
  activatedAt: Date
): ProjectContextPackage {
  const pkg = bootstrap.activePackage?.package as unknown as ProjectBootstrapPackageV1 | undefined;
  const artifactById = new Map((pkg?.artifacts ?? []).map((artifact) => [artifact.artifactId, artifact]));
  const sourceRefs = new Set((pkg?.artifacts ?? []).map((artifact) => artifact.canonicalRef));
  const activationRef = `signal://project-activation/${bootstrap.id}`;
  sourceRefs.add(activationRef);
  const sources: ProjectContextPackage["sources"] = [...sourceRefs].map((sourceRef) => {
    const artifact = [...artifactById.values()].find((item) => item.canonicalRef === sourceRef);
    const extra: Record<string, JsonValue> = artifact
      ? { artifactId: artifact.artifactId, lineageRootIds: artifact.lineageRootIds, derivativeOfArtifactIds: artifact.derivativeOfArtifactIds }
      : {
          bootstrapId: bootstrap.id,
          bootstrapPackageId: bootstrap.activePackage?.packageId ?? null,
          bootstrapScanRunId: bootstrap.activePackage?.scanRunId ?? null,
          activationRevision: manifest.reviewRevision,
          activationManifestRef: `signal://project-activation/${bootstrap.id}/revision/${manifest.reviewRevision}`,
          activationManifestVersion: manifest.version,
          activationManifestHash: bootstrapHash(manifest),
          acceptedCounts: {
            capabilities: manifest.willBecomeCanonical.capabilities.length,
            executionMappings: manifest.willBecomeCanonical.executionMappings.length,
            decisions: manifest.willBecomeCanonical.decisions.length,
            dependencies: manifest.willBecomeCanonical.dependencies.length,
            milestones: manifest.willBecomeCanonical.milestones.length,
            sourceRegistrations: manifest.willBecomeCanonical.sourceRegistrations.length,
          },
        };
    return {
      sourceType: artifact?.provider ?? "project_activation",
      sourceRef,
      registrationId: null,
      role: sourceRef === activationRef ? "requirements_of_record" : "raw_evidence",
      status: "active" as const,
      observedAt: artifact?.observedAt ?? activatedAt.toISOString(),
      succeeded: artifact ? artifact.availability === "available" : true,
      detail: artifact ? artifact.title : "Frozen activation manifest and accepted boundary state.",
      extra,
    };
  });
  const evidence: ProjectContextPackage["evidence"] = (pkg?.evidence ?? []).map((item) => {
    const artifact = artifactById.get(item.artifactId);
    return {
      id: item.evidenceId,
      sourceRef: artifact?.canonicalRef ?? activationRef,
      kind: "bootstrap_evidence",
      excerpt: item.exactQuote,
      externalRef: typeof item.locator.externalRef === "string" ? item.locator.externalRef : artifact?.canonicalRef,
      independence: item.independence,
      data: item.locator,
      extra: { lineageRootIds: item.lineageRootIds, passageHash: item.passageHash ?? null },
    };
  });
  evidence.push({
    id: `activation-boundary:${bootstrap.id}`,
    sourceRef: activationRef,
    kind: "activation_boundary",
    excerpt: `Human activation accepted review revision ${manifest.reviewRevision}; completeness was not certified.`,
    independence: "unknown",
    data: { bootstrapId: bootstrap.id, reviewRevision: manifest.reviewRevision },
    extra: {},
  });
  for (const item of [
    ...manifest.willBecomeCanonical.capabilities,
    ...manifest.willBecomeCanonical.decisions,
    ...manifest.willBecomeCanonical.dependencies,
    ...manifest.willBecomeCanonical.milestones,
    ...manifest.willRemainExternal.candidates,
  ]) {
    evidence.push({
      id: `activation-candidate:${item.candidateId}`,
      sourceRef: activationRef,
      kind: "activation_manifest",
      excerpt: `${item.kind}: ${item.title}; accepted by a human at activation.`,
      independence: "unknown",
      data: { candidateId: item.candidateId, kind: item.kind },
      extra: { operatorAssertion: item.provenance.operatorAssertion },
    });
  }
  for (const gap of manifest.willRemainExternal.providerGaps) {
    evidence.push({
      id: `activation-coverage:${gap.provider}`,
      sourceRef: activationRef,
      kind: "provider_coverage",
      excerpt: `${gap.provider}: ${gap.state}. ${gap.detail}`,
      independence: "unknown",
      data: { provider: gap.provider, state: gap.state },
      extra: {},
    });
  }
  return validateProjectContextPackage({
    version: ACTIVATION_CONTEXT_VERSION,
    packageId: `activation:${bootstrap.id}:revision:${manifest.reviewRevision}`,
    producer: "gap_app",
    generatedAt: activatedAt.toISOString(),
    scopeId,
    sources,
    evidence,
    derivedClaims: [
      ...[
        ...manifest.willBecomeCanonical.capabilities,
        ...manifest.willBecomeCanonical.decisions,
        ...manifest.willBecomeCanonical.dependencies,
        ...manifest.willBecomeCanonical.milestones,
        ...manifest.willBecomeCanonical.sourceRegistrations,
      ].map((item) => ({
        id: `bootstrap-accepted:${item.candidateId}`, kind: item.kind, statement: item.title, evidenceRefs: item.evidenceRefs,
        extra: { disposition: "accepted", canonical: true, sourceCandidateId: item.candidateId, provenance: item.provenance },
      })),
      ...manifest.willRemainExternal.candidates.map((item) => ({
        id: `bootstrap-candidate:${item.candidateId}`, kind: item.kind, statement: item.title, evidenceRefs: item.evidenceRefs,
        extra: { disposition: item.status, canonical: false, sourceCandidateId: item.candidateId },
      })),
    ],
    intelligenceObjects: (pkg?.intelligenceHeads ?? []).map((head) => ({
      id: head.intelligenceId, intelligenceType: head.type, trust: "external_intelligence",
      statement: head.statement, status: head.status, isCurrent: head.isCurrent,
      observedDate: head.observedDate, evidenceRefs: head.evidenceRefs, fields: head.fields,
      provenance: head.provenance,
    })),
    intelligenceRelations: (pkg?.relations ?? []).map((relation) => ({
      from: relation.sourceId, rel: relation.relation, to: relation.targetId,
      relClass: relation.relationClass, fromInPackage: relation.sourceInPackage,
      toInPackage: relation.targetInPackage, extra: { provenance: relation.provenance },
    })),
    intelligenceMeta: { generatedAt: pkg?.generatedAt ?? activatedAt.toISOString(), objectCount: pkg?.intelligenceHeads.length ?? 0, relationCount: pkg?.relations?.length ?? 0 },
    completeness: {
      expectedSources: (pkg?.coverage ?? []).map((item) => item.provider),
      missingSources: manifest.willRemainExternal.providerGaps.map((item) => item.provider),
      excludedSources: [],
    },
    warnings: [manifest.warning, ...(pkg?.warnings ?? [])],
  });
}

function completenessFor(manifest: ActivationManifestV1): PolicyEvaluatedCompleteness {
  return {
    status: manifest.willRemainExternal.providerGaps.length ? "partial" : "complete",
    activeSupplied: [],
    missingActive: manifest.willRemainExternal.providerGaps.map((gap) => ({ sourceRef: `provider://${gap.provider}`, registrationId: `bootstrap-provider:${gap.provider}`, role: "external_coverage" })),
    paused: [], excluded: [], adHoc: [],
  };
}

function firstAuditProposals(manifest: ActivationManifestV1): { type: string; title: string; rationale: string; severity: string; evidenceRef: string }[] {
  const findings: { type: string; title: string; rationale: string; severity: string; evidenceRef: string }[] = [];
  const linked = new Set(manifest.willBecomeCanonical.executionMappings.map((link) => link.candidateId));
  for (const capability of manifest.willBecomeCanonical.capabilities.filter((item) => !linked.has(item.candidateId))) {
    findings.push({ type: "missing_work", title: `${capability.title} has no execution work mapping`, rationale: "The capability is accepted product shape, but no executable work was accepted for it.", severity: "high", evidenceRef: `activation-candidate:${capability.candidateId}` });
  }
  for (const gap of manifest.willRemainExternal.providerGaps) {
    findings.push({ type: "risk", title: `${gap.provider} coverage is ${gap.state.replaceAll("_", " ")}`, rationale: gap.detail, severity: "medium", evidenceRef: `activation-coverage:${gap.provider}` });
  }
  for (const ambiguity of manifest.willRemainExternal.unresolvedAmbiguities.filter((item) => item.kind === "contradiction")) {
    const evidenceRef = manifest.willBecomeCanonical.capabilities[0]
      ? `activation-candidate:${manifest.willBecomeCanonical.capabilities[0].candidateId}`
      : `activation-boundary:${manifest.bootstrapId}`;
    findings.push({ type: "contradiction", title: ambiguity.summary, rationale: "Activation preserved this disagreement outside canonical Reality for review.", severity: "high", evidenceRef });
  }
  for (const dependency of manifest.willRemainExternal.candidates.filter((item) => item.kind === "dependency" && item.status !== "rejected")) {
    findings.push({ type: "risk", title: `External dependency is not represented: ${dependency.title}`, rationale: "External intelligence implies a dependency, but a human did not accept it as ScopeDependency.", severity: "medium", evidenceRef: dependency.evidenceRefs[0] ?? `activation-candidate:${dependency.candidateId}` });
  }
  if (manifest.willBecomeCanonical.capabilities.length === 0) {
    findings.push({ type: "missing_work", title: "Accepted project has no represented capabilities", rationale: "Activation was allowed with explicit gaps; Scope shape remains unrepresented.", severity: "high", evidenceRef: `activation-boundary:${manifest.bootstrapId}` });
  }
  return findings;
}

function acceptedDate(item: ManifestItem): Date | null {
  const value = typeof item.payload.date === "string" ? item.payload.date : typeof item.payload.targetDate === "string" ? item.payload.targetDate : null;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export class ActivationConflictError extends Error {
  status = 409;
}

export class ActivationValidationError extends Error {
  status = 400;
  constructor(message: string, readonly blockers: ActivationManifestV1["blockers"] = []) { super(message); }
}

async function runActivationTransaction(bootstrapId: string, request: ActivationRequest) {
  return prisma.$transaction(async (tx) => {
    const bootstrapRow = await tx.projectBootstrap.findUnique({
      where: { id: bootstrapId },
      include: {
        candidates: { where: { active: true }, include: { evidenceLinks: { select: { evidenceId: true, linkState: true } } }, orderBy: { createdAt: "asc" } },
        activation: true,
      },
    });
    if (!bootstrapRow) throw new ActivationValidationError("Project bootstrap not found");
    const activePackage = bootstrapRow.activePackageId
      ? await tx.bootstrapPackage.findUnique({ where: { id: bootstrapRow.activePackageId }, select: { id: true, packageId: true, scanRunId: true, package: true } })
      : null;
    const bootstrap: BootstrapForManifest & { activation: typeof bootstrapRow.activation } = { ...bootstrapRow, activePackage };
    if (bootstrap.activation) {
      if (bootstrap.activation.reviewRevision !== request.expectedRevision) throw new ActivationConflictError("Project already activated from a different review revision.");
      const [scope, snapshot, audit] = await Promise.all([
        tx.scope.findUniqueOrThrow({ where: { id: bootstrap.activation.scopeId } }),
        tx.contextSnapshot.findUniqueOrThrow({ where: { id: bootstrap.activation.contextSnapshotId } }),
        tx.auditRun.findUniqueOrThrow({ where: { id: bootstrap.activation.firstAuditRunId }, include: { findings: true } }),
      ]);
      return { activation: bootstrap.activation, scope, snapshot, audit, reused: true };
    }
    if (bootstrap.reviewRevision !== request.expectedRevision) throw new ActivationConflictError(`Bootstrap revision changed: expected ${request.expectedRevision}, current ${bootstrap.reviewRevision}.`);
    if (!bootstrap.activePackage) throw new ActivationValidationError("Scan and review a knowledge package before activation.");
    const manifest = buildActivationManifest(bootstrap, request);
    const unacknowledged = manifest.blockers.filter((blocker) => !blocker.acknowledged);
    if (unacknowledged.length) throw new ActivationValidationError("Activation has unacknowledged hard blockers.", unacknowledged);

    const normalizedNames = [bootstrap.canonicalName, ...bootstrap.aliases].map(normalizeSearchText);
    const [scopeCollision, aliasCollision] = await Promise.all([
      tx.scope.findMany({ select: { id: true, name: true } }),
      tx.scopeAlias.findMany({ where: { normalizedAlias: { in: normalizedNames } }, select: { scopeId: true, alias: true } }),
    ]);
    const conflictingScope = scopeCollision.find((scope) => normalizedNames.includes(normalizeSearchText(scope.name)));
    if (conflictingScope || aliasCollision[0]) throw new ActivationConflictError(`Project identity collides with active project ${conflictingScope?.name ?? aliasCollision[0].alias}.`);

    for (const milestone of manifest.willBecomeCanonical.milestones) {
      if (!acceptedDate(milestone)) throw new ActivationValidationError(`Accepted milestone “${milestone.title}” needs an explicit valid date.`);
    }

    const dependencyTargets = new Map<string, string>();
    for (const dependency of manifest.willBecomeCanonical.dependencies) {
      const upstreamId = typeof dependency.payload.upstreamScopeId === "string" ? dependency.payload.upstreamScopeId : null;
      const toEntity = typeof dependency.payload.toEntity === "string" ? normalizeSearchText(dependency.payload.toEntity) : null;
      const upstream = upstreamId
        ? await tx.scope.findUnique({ where: { id: upstreamId }, select: { id: true } })
        : toEntity
          ? (await tx.scope.findMany({ select: { id: true, name: true, aliases: { select: { normalizedAlias: true } } } })).find((scope) => normalizeSearchText(scope.name) === toEntity || scope.aliases.some((alias) => alias.normalizedAlias === toEntity))
          : null;
      if (!upstream) throw new ActivationValidationError(`Accepted dependency “${dependency.title}” does not resolve an existing upstream Scope.`);
      dependencyTargets.set(dependency.candidateId, upstream.id);
    }

    const scope = await tx.scope.create({ data: {
      name: bootstrap.canonicalName,
      teamKey: manifest.execution.teamKey ?? "",
      projectNames: manifest.execution.projectNames,
      labelFilter: manifest.execution.labelFilter,
      executionState: manifest.execution.state,
      executionDetail: manifest.execution.detail,
      dependsOnScopeIds: [...new Set(dependencyTargets.values())],
    } });

    for (const alias of bootstrap.aliases) {
      await tx.scopeAlias.create({ data: { scopeId: scope.id, alias, normalizedAlias: normalizeSearchText(alias), provenance: { bootstrapId, reviewRevision: manifest.reviewRevision } } });
    }

    for (const item of manifest.willBecomeCanonical.capabilities) {
      const capability = await tx.capability.create({ data: {
        scopeId: scope.id, name: typeof item.payload.name === "string" ? item.payload.name : item.title,
        description: typeof item.payload.description === "string" ? item.payload.description : typeof item.payload.intent === "string" ? item.payload.intent : null,
        provenance: item.provenance as Prisma.InputJsonValue, sourceCandidateId: item.candidateId,
      } });
      for (const link of executionLinks(item)) {
        const raw = (Array.isArray(item.payload.executionLinks) ? item.payload.executionLinks : [item.payload.executionLink]).map(record)
          .find((candidate) => candidate.provider === link.provider && candidate.externalId === link.externalId);
        await tx.capabilityWorkLink.create({ data: {
          capabilityId: capability.id, provider: link.provider, externalId: link.externalId,
          externalUrl: typeof raw?.externalUrl === "string" ? raw.externalUrl : null,
          state: typeof raw?.state === "string" ? raw.state : "configured",
          provenance: { ...item.provenance, sourceCandidateId: item.candidateId } as Prisma.InputJsonValue,
        } });
      }
    }

    for (const item of manifest.willBecomeCanonical.decisions) {
      const decision = await tx.decision.create({ data: {
        scopeId: scope.id, title: typeof item.payload.question === "string" ? item.payload.question : item.title,
        status: "open", owner: typeof item.payload.owner === "string" ? item.payload.owner : typeof item.payload.ownerHint === "string" ? item.payload.ownerHint : null,
        rationale: typeof item.payload.rationale === "string" ? item.payload.rationale : null,
        sourceClaimKey: `bootstrap:${item.candidateId}`,
      } });
      const pkg = bootstrap.activePackage.package as unknown as ProjectBootstrapPackageV1;
      for (const ref of item.evidenceRefs) {
        const evidence = pkg.evidence.find((entry) => entry.evidenceId === ref);
        if (!evidence) continue;
        const artifact = pkg.artifacts.find((entry) => entry.artifactId === evidence.artifactId);
        await tx.decisionEvidence.create({ data: {
          decisionId: decision.id, kind: "context_package", excerpt: evidence.exactQuote,
          evidenceItemId: evidence.evidenceId, externalRef: typeof evidence.locator.externalRef === "string" ? evidence.locator.externalRef : artifact?.canonicalRef,
          sourceLabel: artifact?.title ?? "Bootstrap knowledge",
        } });
      }
    }

    for (const item of manifest.willBecomeCanonical.dependencies) {
      await tx.scopeDependency.create({ data: {
        upstreamScopeId: dependencyTargets.get(item.candidateId)!, downstreamScopeId: scope.id,
        basis: typeof item.payload.assertionBasis === "string" ? item.payload.assertionBasis : item.title,
        evidence: { evidenceRefs: item.evidenceRefs, provenance: item.provenance } as Prisma.InputJsonValue,
        sourceCandidateId: item.candidateId,
      } });
    }

    for (const item of manifest.willBecomeCanonical.milestones) {
      const semantic = typeof item.payload.semanticState === "string" ? item.payload.semanticState
        : typeof item.payload.planningState === "string" && item.payload.planningState !== "candidate" ? item.payload.planningState : "planned";
      await tx.timelineEvent.create({ data: {
        scopeId: scope.id, kind: "milestone", title: item.title, date: acceptedDate(item)!,
        temporalState: semantic === "occurred" ? "occurred" : "planned", semanticState: semantic,
        note: typeof item.payload.note === "string" ? item.payload.note : null,
        source: "candidate", sourceLabel: item.provenance.operatorAssertion === true ? "Operator assertion" : "Project activation",
        evidenceRefs: item.evidenceRefs, sourceClaimKey: `bootstrap:${item.candidateId}`,
      } });
    }

    for (const item of manifest.willBecomeCanonical.sourceRegistrations) {
      const ref = typeof item.payload.canonicalRef === "string" ? item.payload.canonicalRef : null;
      const sourceType = typeof item.payload.sourceType === "string" ? item.payload.sourceType : typeof item.payload.provider === "string" ? item.payload.provider : null;
      if (!ref || !sourceType) throw new ActivationValidationError(`Accepted source “${item.title}” lacks sourceRef/provider identity.`);
      await tx.sourceRegistration.create({ data: {
        sourceType, sourceRef: ref, scopeIds: [scope.id],
        role: typeof item.payload.role === "string" ? item.payload.role : item.payload.derivative === true ? "supplemental_context" : "raw_evidence",
        status: "active", rationale: `Accepted during Project Activation from candidate ${item.candidateId}.`, statusReason: "Accepted in activation manifest.", statusChangedAt: new Date(),
        sourceCandidateId: item.candidateId, provenance: item.provenance as Prisma.InputJsonValue,
      } });
    }

    const now = new Date();
    const contextPackage = activationContextPackage(scope.id, bootstrap, manifest, now);
    const contextHash = hashProjectContextPackage(contextPackage);
    const snapshot = await tx.contextSnapshot.create({ data: {
      scopeId: scope.id, packageId: contextPackage.packageId, packageVersion: contextPackage.version,
      producer: contextPackage.producer, package: contextPackage as unknown as Prisma.InputJsonValue,
      contextHash, completenessSummary: completenessFor(manifest) as unknown as Prisma.InputJsonValue,
    } });
    await tx.decisionEvidence.updateMany({
      where: { decision: { scopeId: scope.id, sourceClaimKey: { startsWith: "bootstrap:" } } },
      data: { contextSnapshotId: snapshot.id },
    });
    await tx.timelineEvent.updateMany({
      where: { scopeId: scope.id, sourceClaimKey: { startsWith: "bootstrap:" } },
      data: { contextSnapshotId: snapshot.id },
    });

    const proposals = firstAuditProposals(manifest);
    const audit = await tx.auditRun.create({ data: {
      sourceId: null, contextSnapshotId: snapshot.id, issueCount: 0, findingCount: proposals.length, model: FIRST_AUDIT_MODEL,
    } });
    for (const finding of proposals) {
      await tx.finding.create({ data: {
        sourceId: null, auditRunId: audit.id, contextSnapshotId: snapshot.id,
        type: finding.type, title: finding.title, quote: finding.rationale, rationale: finding.rationale,
        severity: finding.severity, blocking: finding.type === "missing_work", matchedIssues: [], evidenceRefs: [finding.evidenceRef],
      } });
    }

    const activation = await tx.projectActivation.create({ data: {
      bootstrapId, scopeId: scope.id, reviewRevision: manifest.reviewRevision,
      manifestVersion: manifest.version, manifest: manifest as unknown as Prisma.InputJsonValue,
      contextSnapshotId: snapshot.id, firstAuditRunId: audit.id,
    } });
    await tx.projectBootstrap.update({ where: { id: bootstrapId }, data: { status: "activated" } });
    await tx.bootstrapReviewEvent.create({ data: {
      bootstrapId, action: "activate", fromStatus: "reviewing", toStatus: "activated",
      detail: { activationId: activation.id, scopeId: scope.id, contextSnapshotId: snapshot.id, firstAuditRunId: audit.id, reviewRevision: manifest.reviewRevision },
    } });
    const fullAudit = await tx.auditRun.findUniqueOrThrow({ where: { id: audit.id }, include: { findings: true } });
    return { activation, scope, snapshot, audit: fullAudit, reused: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function readCompletedActivation(bootstrapId: string, expectedRevision: number) {
  const activation = await prisma.projectActivation.findUnique({ where: { bootstrapId } });
  if (!activation || activation.reviewRevision !== expectedRevision) return null;
  const [scope, snapshot, audit] = await Promise.all([
    prisma.scope.findUniqueOrThrow({ where: { id: activation.scopeId } }),
    prisma.contextSnapshot.findUniqueOrThrow({ where: { id: activation.contextSnapshotId } }),
    prisma.auditRun.findUniqueOrThrow({ where: { id: activation.firstAuditRunId }, include: { findings: true } }),
  ]);
  return { activation, scope, snapshot, audit, reused: true as const };
}

/**
 * The transaction owns all canonical writes. The small retry shell handles
 * PostgreSQL serializable conflicts and the activation unique key so two
 * simultaneous clicks converge on the one committed activation result.
 */
export async function activateProjectBootstrap(bootstrapId: string, request: ActivationRequest) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await runActivationTransaction(bootstrapId, request);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
        const completed = await readCompletedActivation(bootstrapId, request.expectedRevision);
        if (completed) return completed;
        if (error.code === "P2034" && attempt < 2) continue;
      }
      throw error;
    }
  }
  throw new ActivationConflictError("Activation could not acquire a serializable transaction after three attempts.");
}
