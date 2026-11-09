import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RequestValidationError } from "@/lib/http/json";
import { lockBootstrap } from "./identity";
import { bootstrapHash, stableId } from "./hash";
import { resolveRefreshDisposition } from "./rescan";
import type { ProjectBootstrapPackageV1 } from "./contracts";

function emptyJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function persistCompiledPackage(
  scanRunId: string,
  compiled: ProjectBootstrapPackageV1,
): Promise<void> {
  const fullHash = bootstrapHash(compiled);
  await prisma.$transaction(
    async (tx) => {
      await lockBootstrap(tx, compiled.bootstrapId);
      const bootstrapState = await tx.projectBootstrap.findUnique({
        where: { id: compiled.bootstrapId },
      });
      const scan = await tx.bootstrapScanRun.findUnique({ where: { id: scanRunId } });
      if (!bootstrapState || !scan || scan.bootstrapId !== compiled.bootstrapId) {
        throw new RequestValidationError(
          "Package scan does not belong to this project setup.",
          409,
        );
      }
      const identityChanged = await tx.bootstrapReviewEvent.findFirst({
        where: {
          bootstrapId: compiled.bootstrapId,
          action: "identity_changed",
          detail: { path: ["invalidatedScanIds"], array_contains: [scan.id] },
        },
        select: { id: true },
      });
      // Re-check after locking, not before: an identity edit may win while the
      // companion is still uploading. History cannot be made current by a retry.
      if (identityChanged || scan.status === "stale" || bootstrapState.status === "archived") {
        throw new RequestValidationError(
          "Project identity changed after this scan started. Rescan before accepting its proposals.",
          409,
        );
      }
      const identity = compiled.requestedIdentity;
      if (
        bootstrapHash({
          canonicalName: identity.canonicalName,
          aliases: identity.aliases,
          ownerHint: identity.ownerHint || null,
          sourceHints: identity.sourceHints,
        }) !==
        bootstrapHash({
          canonicalName: bootstrapState.canonicalName,
          aliases: bootstrapState.aliases,
          ownerHint: bootstrapState.ownerHint,
          sourceHints: bootstrapState.sourceHints,
        })
      ) {
        throw new RequestValidationError(
          "Package identity does not match this project setup. Start a fresh scan.",
          409,
        );
      }
      const existing = await tx.bootstrapPackage.findUnique({
        where: {
          producer_packageId: { producer: compiled.producer, packageId: compiled.packageId },
        },
      });
      if (existing) {
        // The local compiler keeps a content-addressed ID across scan times.
        // A new generatedAt alone may reuse it; changed content may not.
        const priorContent = existing.package as unknown as ProjectBootstrapPackageV1;
        if (
          existing.bootstrapId !== compiled.bootstrapId ||
          bootstrapHash({ ...priorContent, generatedAt: null }) !==
            bootstrapHash({ ...compiled, generatedAt: null })
        ) {
          throw new RequestValidationError(
            "Package identity was reused for different content or a different project.",
            409,
          );
        }
        const switchingPackage = bootstrapState.activePackageId !== existing.id;
        if (switchingPackage) {
          await tx.bootstrapCandidate.updateMany({
            where: { bootstrapId: compiled.bootstrapId, packageId: { not: null } },
            data: { active: false },
          });
          await tx.bootstrapCandidate.updateMany({
            where: { packageId: existing.id },
            data: { active: true },
          });
        }
        await tx.projectBootstrap.update({
          where: { id: compiled.bootstrapId },
          data: {
            activePackageId: existing.id,
            status: bootstrapState.status === "activated" ? "activated" : "reviewing",
            ...(switchingPackage ? { reviewRevision: { increment: 1 } } : {}),
          },
        });
        await tx.bootstrapScanRun.update({
          where: { id: scanRunId },
          data: {
            status: "complete",
            stage: "complete",
            resultPackageId: existing.id,
            completedAt: new Date(),
            providerCoverage: emptyJson(compiled.coverage),
            metrics: emptyJson({
              providersChecked: compiled.coverage.length,
              artifactsFound: compiled.artifacts.length,
              intelligenceHeads: compiled.intelligenceHeads.length,
              evidencePassages: compiled.evidence.length,
              proposals: compiled.proposals.length,
            }),
            warnings: emptyJson(compiled.warnings),
          },
        });
        return;
      }

      const previous = await tx.bootstrapPackage.findFirst({
        where: { bootstrapId: compiled.bootstrapId },
        orderBy: { createdAt: "desc" },
      });
      const identityPackages = await tx.bootstrapPackage.findMany({
        where: { bootstrapId: compiled.bootstrapId },
        select: { id: true, package: true },
      });
      // Matching proposal keys alone are not enough: review choices belong to
      // the identity under which the human made them, never a different project.
      const historyPackageIds = identityPackages
        .filter(
          (row) =>
            bootstrapHash(
              (row.package as unknown as ProjectBootstrapPackageV1).requestedIdentity,
            ) === bootstrapHash(compiled.requestedIdentity),
        )
        .map((row) => row.id);
      const candidateHistory = await tx.bootstrapCandidate.findMany({
        where: { bootstrapId: compiled.bootstrapId, packageId: { in: historyPackageIds } },
        orderBy: { createdAt: "desc" },
        include: { evidenceLinks: true },
      });
      const historyByKey = new Map<string, typeof candidateHistory>();
      for (const candidate of candidateHistory)
        historyByKey.set(candidate.candidateKey, [
          ...(historyByKey.get(candidate.candidateKey) ?? []),
          candidate,
        ]);

      await tx.bootstrapCandidate.updateMany({
        where: { bootstrapId: compiled.bootstrapId, packageId: { not: null } },
        data: { active: false },
      });
      const packageRow = await tx.bootstrapPackage.create({
        data: {
          bootstrapId: compiled.bootstrapId,
          scanRunId,
          packageId: compiled.packageId,
          packageVersion: compiled.version,
          producer: compiled.producer,
          compilerVersion: compiled.compilerVersion,
          packageHash: fullHash,
          package: emptyJson(compiled),
          generatedAt: new Date(compiled.generatedAt),
          supersedesPackageId: previous?.id,
        },
      });
      // Preserve the same review-overlay semantics, but avoid one database round
      // trip per evidence link. Quote-complete packages contain thousands of
      // links and previously expired the interactive transaction mid-import.
      const candidateRows: Prisma.BootstrapCandidateCreateManyInput[] = [];
      const evidenceRows: Prisma.BootstrapEvidenceLinkCreateManyInput[] = [];
      for (const item of compiled.proposals) {
        const history = historyByKey.get(item.candidateKey) ?? [];
        const prior =
          history.find((candidate) => candidate.sourceFingerprint === item.fingerprint) ??
          history[0];
        const refresh = resolveRefreshDisposition(prior, item.fingerprint);
        const candidateId = stableId("bootstrap-candidate", [packageRow.id, item.candidateKey], 40);
        candidateRows.push({
          id: candidateId,
          bootstrapId: compiled.bootstrapId,
          packageId: packageRow.id,
          candidateKey: item.candidateKey,
          kind: item.kind,
          title: item.title,
          summary: item.statement,
          whyProposed: item.whyProposed,
          matchBasis: item.matchBasis,
          currentness: item.currentness,
          relevance: item.relevance,
          sourceFingerprint: item.fingerprint,
          originalProposal: emptyJson(item),
          reviewedProposal: refresh.reviewedProposal
            ? (refresh.reviewedProposal as Prisma.InputJsonValue)
            : undefined,
          status: refresh.status,
          dispositionReason: refresh.dispositionReason,
          changedSincePrior: refresh.changedSincePrior,
          carriedFromCandidateId: prior?.id,
        });
        for (const evidenceId of item.evidenceRefs) {
          const previousLink = !refresh.changedSincePrior
            ? prior?.evidenceLinks.find((l) => l.evidenceId === evidenceId)
            : undefined;
          evidenceRows.push({
            candidateId,
            evidenceId,
            linkState: previousLink?.linkState ?? "attached",
            attachedBy: previousLink?.attachedBy ?? "compiler",
            reason: previousLink?.reason,
          });
        }
      }
      // Bound batch size below PostgreSQL's parameter limit, including the
      // contract's largest accepted package. Everything remains atomic.
      for (let offset = 0; offset < candidateRows.length; offset += 250) {
        await tx.bootstrapCandidate.createMany({ data: candidateRows.slice(offset, offset + 250) });
      }
      for (let offset = 0; offset < evidenceRows.length; offset += 1000) {
        await tx.bootstrapEvidenceLink.createMany({
          data: evidenceRows.slice(offset, offset + 1000),
        });
      }
      await tx.projectBootstrap.update({
        where: { id: compiled.bootstrapId },
        data: {
          activePackageId: packageRow.id,
          status: bootstrapState?.status === "activated" ? "activated" : "reviewing",
          reviewRevision: { increment: 1 },
        },
      });
      await tx.bootstrapScanRun.update({
        where: { id: scanRunId },
        data: {
          status: "complete",
          stage: "complete",
          resultPackageId: packageRow.id,
          completedAt: new Date(),
          providerCoverage: emptyJson(compiled.coverage),
          metrics: emptyJson({
            providersChecked: compiled.coverage.length,
            artifactsFound: compiled.artifacts.length,
            intelligenceHeads: compiled.intelligenceHeads.length,
            evidencePassages: compiled.evidence.length,
            proposals: compiled.proposals.length,
          }),
          warnings: emptyJson(compiled.warnings),
        },
      });
    },
    { timeout: 30_000 },
  );
}
