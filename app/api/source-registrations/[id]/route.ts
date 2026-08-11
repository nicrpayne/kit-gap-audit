import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = new Set(["candidate", "active", "paused", "superseded", "retired"]);
const VALID_ROLES = new Set([
  "operational_tracker",
  "requirements_of_record",
  "design_reference",
  "supplemental_context",
  "raw_evidence",
]);

// The one explicit write path for a SourceRegistration's policy (role,
// status, rationale, supersession) -- see docs/CONTEXT-MODEL.md's "Hermes
// recommends; only an explicit write changes Reality" boundary. A status
// change always requires a non-empty statusReason, regardless of caller
// (human or an eventual approved Hermes action) -- there is no silent,
// reason-less status change.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: {
    role?: string;
    rationale?: string;
    scopeIds?: string[];
    status?: string;
    statusReason?: string;
    supersededByRegistrationId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const existing = await prisma.sourceRegistration.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "SourceRegistration not found" }, { status: 404 });
  }

  if (body.role !== undefined && !VALID_ROLES.has(body.role)) {
    return NextResponse.json({ error: `role must be one of: ${[...VALID_ROLES].join(", ")}` }, { status: 400 });
  }
  if (body.scopeIds !== undefined && !Array.isArray(body.scopeIds)) {
    return NextResponse.json({ error: "scopeIds must be an array of Scope ids" }, { status: 400 });
  }

  const changingStatus = body.status !== undefined && body.status !== existing.status;
  if (changingStatus) {
    if (!body.status || !VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: `status must be one of: ${[...VALID_STATUSES].join(", ")}` }, { status: 400 });
    }
    if (!body.statusReason?.trim()) {
      return NextResponse.json(
        { error: "statusReason is required when changing status -- no silent status changes" },
        { status: 400 }
      );
    }
  }

  if (body.supersededByRegistrationId) {
    if (body.supersededByRegistrationId === id) {
      return NextResponse.json({ error: "A source cannot be superseded by itself" }, { status: 400 });
    }
    const replacement = await prisma.sourceRegistration.findUnique({
      where: { id: body.supersededByRegistrationId },
      select: { id: true },
    });
    if (!replacement) {
      return NextResponse.json({ error: "supersededByRegistrationId does not reference a known SourceRegistration" }, { status: 400 });
    }
  }

  const registration = await prisma.sourceRegistration.update({
    where: { id },
    data: {
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.rationale !== undefined ? { rationale: body.rationale.trim() || null } : {}),
      ...(body.scopeIds !== undefined ? { scopeIds: body.scopeIds } : {}),
      ...(changingStatus
        ? { status: body.status, statusReason: body.statusReason!.trim(), statusChangedAt: new Date() }
        : {}),
      ...(body.supersededByRegistrationId !== undefined
        ? { supersededByRegistrationId: body.supersededByRegistrationId || null }
        : {}),
    },
  });

  return NextResponse.json({ registration });
}
