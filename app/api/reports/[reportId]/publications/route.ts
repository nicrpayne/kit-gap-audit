import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDecisionBriefV1 } from "@/lib/reports/decisionBrief";
import { isBriefRecipeV1 } from "@/lib/reports/composer";
import { createInteractiveBriefBundle, validatePublicationReadiness } from "@/lib/reports/publication";
import { siteHandoffPrompt } from "@/lib/reports/publicationContract";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const publications = await prisma.reportPublication.findMany({
    where: { reportId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, reportId: true, briefSnapshotHash: true, bundleVersion: true, bundleHash: true,
      audience: true, purpose: true, destinationType: true, status: true, operator: true,
      createdAt: true, handoffOpenedAt: true, draftGeneratedAt: true, previewedAt: true,
      publishedAt: true, failedAt: true, externalArtifactId: true, externalUrl: true,
      lastVerifiedAt: true, lastVerifiedState: true,
    },
  });
  return NextResponse.json({ publications });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) return NextResponse.json({ error: "Immutable report not found." }, { status: 404 });
  if (!isDecisionBriefV1(report.briefSnapshot) || !isBriefRecipeV1(report.briefRecipe)) {
    return NextResponse.json({ error: "Create interactive site requires an immutable DecisionBriefV1 with a saved BriefRecipeV1." }, { status: 409 });
  }
  const bundle = createInteractiveBriefBundle(report.id, report.briefSnapshot, report.briefRecipe);
  const readiness = validatePublicationReadiness(bundle);
  if (!readiness.ready) return NextResponse.json({ error: "Publication readiness failed closed.", readiness }, { status: 422 });

  const existing = await prisma.reportPublication.findUnique({ where: { bundleHash: bundle.integrity.bundleHash } });
  const newerReport = await prisma.report.findFirst({
    where: { scopeId: report.scopeId, generatedAt: { gt: report.generatedAt } },
    orderBy: { generatedAt: "desc" },
    select: { id: true, generatedAt: true },
  });
  const publication = existing ?? await prisma.reportPublication.create({
    data: {
      reportId: report.id,
      briefSnapshotHash: bundle.integrity.snapshotFingerprint,
      bundleVersion: bundle.version,
      bundleHash: bundle.integrity.bundleHash,
      audience: bundle.identity.audience,
      purpose: bundle.identity.purpose,
      destinationType: "chatgpt_sites",
      status: "bundle_ready",
      operator: "authenticated_operator",
      bundleSnapshot: bundle as unknown as Prisma.InputJsonValue,
      excludedMaterial: readiness.exclusions as unknown as Prisma.InputJsonValue,
      lastVerifiedState: "signal_verified_bundle",
    },
  });
  return NextResponse.json({
    publication,
    bundle,
    readiness,
    handoffPrompt: siteHandoffPrompt(bundle),
    revisionContext: {
      newerProjectTruthAvailable: Boolean(newerReport),
      latestReportId: newerReport?.id ?? report.id,
      latestReportGeneratedAt: newerReport?.generatedAt ?? report.generatedAt,
    },
  }, { status: existing ? 200 : 201 });
}
