import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { PublicationStatus } from "@/lib/reports/publicationContract";

const NEXT: Record<PublicationStatus, PublicationStatus[]> = {
  bundle_ready: ["handoff_opened", "failed"],
  handoff_opened: ["draft_generated", "failed"],
  draft_generated: ["previewed", "failed"],
  previewed: ["published_shared", "failed"],
  published_shared: [],
  failed: [],
};

function supportedStatus(value: unknown): value is PublicationStatus {
  return typeof value === "string" && Object.hasOwn(NEXT, value);
}

function safeHttpsUrl(value: unknown): string | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2_048) return "invalid";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "invalid";
  } catch {
    return "invalid";
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ publicationId: string }> }) {
  const { publicationId } = await params;
  const publication = await prisma.reportPublication.findUnique({ where: { id: publicationId } });
  if (!publication) return NextResponse.json({ error: "Publication record not found." }, { status: 404 });
  return NextResponse.json({ publication });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ publicationId: string }> }) {
  const { publicationId } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !supportedStatus(body.status)) return NextResponse.json({ error: "A supported publication status is required." }, { status: 400 });
  const existing = await prisma.reportPublication.findUnique({ where: { id: publicationId } });
  if (!existing) return NextResponse.json({ error: "Publication record not found." }, { status: 404 });
  const current = existing.status as PublicationStatus;
  if (!supportedStatus(current) || !NEXT[current].includes(body.status)) {
    return NextResponse.json({ error: `Publication cannot move from ${existing.status} to ${body.status}.` }, { status: 409 });
  }
  const externalUrl = safeHttpsUrl(body.externalUrl);
  if (externalUrl === "invalid") return NextResponse.json({ error: "externalUrl must be a valid HTTPS URL." }, { status: 400 });
  if (body.status === "published_shared" && !externalUrl && !existing.externalUrl) {
    return NextResponse.json({ error: "Published/shared requires the operator-confirmed ChatGPT Site URL." }, { status: 400 });
  }
  const now = new Date();
  const timestamps = {
    ...(body.status === "handoff_opened" ? { handoffOpenedAt: now } : {}),
    ...(body.status === "draft_generated" ? { draftGeneratedAt: now } : {}),
    ...(body.status === "previewed" ? { previewedAt: now } : {}),
    ...(body.status === "published_shared" ? { publishedAt: now } : {}),
    ...(body.status === "failed" ? { failedAt: now } : {}),
  };
  const publication = await prisma.reportPublication.update({
    where: { id: publicationId },
    data: {
      status: body.status,
      ...timestamps,
      ...(typeof body.externalArtifactId === "string" && body.externalArtifactId.trim() ? { externalArtifactId: body.externalArtifactId.trim().slice(0, 300) } : {}),
      ...(externalUrl ? { externalUrl } : {}),
      lastVerifiedAt: now,
      lastVerifiedState: `operator_attested_${body.status}`,
    },
  });
  return NextResponse.json({ publication });
}
