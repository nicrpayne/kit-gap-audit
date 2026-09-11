import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashProjectContextPackage } from "@/lib/context/hash";
import type { JsonValue, ProjectContextPackage } from "@/lib/context/package";
import type { PolicyEvaluatedCompleteness } from "@/lib/context/sourcePolicy";
import { validateProjectContextPackage } from "@/lib/context/validate";
import type { ProjectBootstrapPackageV1 } from "./contracts";
import { FIRST_AUDIT_MODEL } from "./activation";
import { syncRefreshChangeProposals } from "@/lib/audit/changeInbox";

const REFRESH_AUDIT_MODEL = `${FIRST_AUDIT_MODEL}:refresh`;

function toContextPackage(scopeId: string, pkg: ProjectBootstrapPackageV1): ProjectContextPackage {
  const refreshRef = `signal://bootstrap-refresh/${pkg.bootstrapId}/${pkg.packageId}`;
  const artifactById = new Map(pkg.artifacts.map((artifact) => [artifact.artifactId, artifact]));
  const sources: ProjectContextPackage["sources"] = [
    ...pkg.artifacts.map((artifact) => ({
      sourceType: artifact.provider, sourceRef: artifact.canonicalRef, registrationId: null,
      role: artifact.derivativeOfArtifactIds.length ? "supplemental_context" : "raw_evidence",
      status: "active" as const, observedAt: artifact.observedAt ?? pkg.generatedAt,
      succeeded: artifact.availability === "available", detail: artifact.title,
      extra: { artifactId: artifact.artifactId, lineageRootIds: artifact.lineageRootIds, derivativeOfArtifactIds: artifact.derivativeOfArtifactIds } as Record<string, JsonValue>,
    })),
    {
      sourceType: "bootstrap_refresh", sourceRef: refreshRef, registrationId: null,
      role: "supplemental_context", status: "active", observedAt: pkg.generatedAt,
      succeeded: true, detail: "External refresh coverage and candidate ledger.",
      extra: { bootstrapId: pkg.bootstrapId, bootstrapPackageId: pkg.packageId },
    },
  ];
  const evidence: ProjectContextPackage["evidence"] = pkg.evidence.map((item) => ({
    id: item.evidenceId, sourceRef: artifactById.get(item.artifactId)?.canonicalRef ?? refreshRef,
    kind: "bootstrap_evidence", excerpt: item.exactQuote,
    externalRef: typeof item.locator.externalRef === "string" ? item.locator.externalRef : artifactById.get(item.artifactId)?.canonicalRef,
    independence: item.independence, data: item.locator,
    extra: { lineageRootIds: item.lineageRootIds, passageHash: item.passageHash ?? null },
  }));
  evidence.push({
    id: `refresh-boundary:${pkg.bootstrapId}`,
    sourceRef: refreshRef,
    kind: "refresh_boundary",
    excerpt: "This package is external intelligence and cannot mutate accepted Reality without a new human-governed acceptance.",
    independence: "unknown",
    data: { bootstrapId: pkg.bootstrapId, packageId: pkg.packageId },
  });
  for (const coverage of pkg.coverage.filter((item) => item.state !== "available")) {
    evidence.push({
      id: `refresh-coverage:${coverage.provider}`, sourceRef: refreshRef, kind: "provider_coverage",
      excerpt: `${coverage.provider}: ${coverage.state}. ${coverage.detail}`,
      independence: "unknown", data: { provider: coverage.provider, state: coverage.state },
    });
  }
  for (const proposal of pkg.proposals) {
    evidence.push({
      id: `refresh-proposal:${proposal.proposalId}`, sourceRef: refreshRef, kind: "external_candidate",
      excerpt: `${proposal.kind}: ${proposal.title}. ${proposal.whyProposed}`,
      independence: "unknown", data: { proposalId: proposal.proposalId, candidateKey: proposal.candidateKey },
    });
  }
  return validateProjectContextPackage({
    version: "1.1",
    packageId: `bootstrap-refresh:${pkg.producer}:${pkg.packageId}`,
    producer: "gap_app",
    generatedAt: pkg.generatedAt,
    scopeId,
    sources,
    evidence,
    derivedClaims: pkg.proposals.map((proposal) => ({
      id: `refresh:${proposal.proposalId}`, kind: proposal.kind, statement: proposal.statement,
      evidenceRefs: proposal.evidenceRefs,
      extra: { trust: "external_candidate", candidateKey: proposal.candidateKey, basis: proposal.basis ?? "inferred" },
    })),
    intelligenceObjects: pkg.intelligenceHeads.map((head) => ({
      id: head.intelligenceId, intelligenceType: head.type, trust: "external_intelligence",
      statement: head.statement, isCurrent: head.isCurrent, status: head.status,
      observedDate: head.observedDate, evidenceRefs: head.evidenceRefs, fields: head.fields, provenance: head.provenance,
    })),
    intelligenceRelations: (pkg.relations ?? []).map((relation) => ({
      from: relation.sourceId, rel: relation.relation, to: relation.targetId,
      relClass: relation.relationClass, fromInPackage: relation.sourceInPackage,
      toInPackage: relation.targetInPackage, extra: { provenance: relation.provenance },
    })),
    intelligenceMeta: { generatedAt: pkg.generatedAt, objectCount: pkg.intelligenceHeads.length, relationCount: pkg.relations?.length ?? 0 },
    completeness: {
      expectedSources: pkg.coverage.map((item) => item.provider),
      missingSources: pkg.coverage.filter((item) => item.state !== "available").map((item) => item.provider),
      excludedSources: [],
    },
    warnings: ["External refresh cannot mutate accepted Reality; a new human-governed acceptance is required.", ...pkg.warnings],
  });
}

function completeness(pkg: ProjectBootstrapPackageV1): PolicyEvaluatedCompleteness {
  const gaps = pkg.coverage.filter((item) => item.state !== "available");
  return {
    status: gaps.length ? "partial" : "complete", activeSupplied: [],
    missingActive: gaps.map((gap) => ({ sourceRef: `provider://${gap.provider}`, registrationId: `bootstrap-provider:${gap.provider}`, role: "external_coverage" })),
    paused: [], excluded: [], adHoc: [],
  };
}

export async function auditActivatedBootstrapRefresh(bootstrapId: string) {
  const bootstrap = await prisma.projectBootstrap.findUnique({
    where: { id: bootstrapId }, include: { activation: true },
  });
  if (!bootstrap?.activation || !bootstrap.activePackageId) return null;
  const packageRow = await prisma.bootstrapPackage.findUnique({ where: { id: bootstrap.activePackageId } });
  if (!packageRow) return null;
  const pkg = packageRow.package as unknown as ProjectBootstrapPackageV1;
  const context = toContextPackage(bootstrap.activation.scopeId, pkg);
  const contextHash = hashProjectContextPackage(context);
  const proposals = [
    ...pkg.coverage.filter((item) => item.state !== "available").map((item) => ({
      type: "risk", title: `${item.provider} coverage is ${item.state.replaceAll("_", " ")}`,
      rationale: item.detail, severity: "medium", ref: `refresh-coverage:${item.provider}`,
    })),
    ...pkg.ambiguities.filter((item) => item.kind === "contradiction").map((item) => ({
      type: "contradiction", title: item.summary,
      rationale: "New external intelligence disagrees; canonical Reality was not changed.", severity: "high",
      ref: pkg.proposals[0] ? `refresh-proposal:${pkg.proposals[0].proposalId}` : `refresh-boundary:${pkg.bootstrapId}`,
    })),
    ...pkg.proposals.filter((item) => item.kind === "dependency").map((item) => ({
      type: "risk", title: `External dependency candidate: ${item.title}`,
      rationale: "The knowledge refresh proposed a relationship; only human acceptance can make it a ScopeDependency.", severity: "medium",
      ref: `refresh-proposal:${item.proposalId}`,
    })),
  ];
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.contextSnapshot.findUnique({ where: { producer_packageId: { producer: context.producer, packageId: context.packageId } } });
    if (existing) {
      if (existing.contextHash !== contextHash) throw new Error("Bootstrap refresh package identity collision");
      const audit = await tx.auditRun.findFirst({ where: { contextSnapshotId: existing.id, model: REFRESH_AUDIT_MODEL }, include: { findings: true } });
      return { snapshot: existing, audit, reused: true, canonicalWrites: 0 };
    }
    const snapshot = await tx.contextSnapshot.create({ data: {
      scopeId: context.scopeId, packageId: context.packageId, packageVersion: context.version,
      producer: context.producer, package: context as unknown as Prisma.InputJsonValue,
      contextHash, completenessSummary: completeness(pkg) as unknown as Prisma.InputJsonValue,
    } });
    const audit = await tx.auditRun.create({ data: {
      sourceId: null, contextSnapshotId: snapshot.id, issueCount: 0,
      findingCount: proposals.length, model: REFRESH_AUDIT_MODEL,
    } });
    for (const item of proposals) await tx.finding.create({ data: {
      sourceId: null, auditRunId: audit.id, contextSnapshotId: snapshot.id,
      type: item.type, title: item.title, quote: item.rationale, rationale: item.rationale,
      severity: item.severity, blocking: false, matchedIssues: [], evidenceRefs: [item.ref],
    } });
    return { snapshot, audit: await tx.auditRun.findUniqueOrThrow({ where: { id: audit.id }, include: { findings: true } }), reused: false, canonicalWrites: 0 };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result.audit) {
    const inbox = await syncRefreshChangeProposals({
      scopeId: bootstrap.activation.scopeId,
      snapshotId: result.snapshot.id,
      auditRunId: result.audit.id,
      pkg,
    });
    return { ...result, inbox };
  }
  return result;
}
