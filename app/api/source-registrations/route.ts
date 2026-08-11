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

// Lists registrations relevant to a Scope: portfolio-wide (scopeIds: [])
// plus anything explicitly naming this scopeId. Omitting scopeId returns
// every registration -- useful for a future admin view, not needed by any
// consumer yet.
export async function GET(req: NextRequest) {
  const scopeId = req.nextUrl.searchParams.get("scopeId");

  const registrations = await prisma.sourceRegistration.findMany({
    where: scopeId ? { OR: [{ scopeIds: { isEmpty: true } }, { scopeIds: { has: scopeId } }] } : undefined,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ registrations });
}

export async function POST(req: NextRequest) {
  let body: {
    sourceType?: string;
    sourceRef?: string;
    scopeIds?: string[];
    role?: string;
    status?: string;
    rationale?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.sourceType?.trim()) {
    return NextResponse.json({ error: "sourceType is required" }, { status: 400 });
  }
  if (!body.sourceRef?.trim()) {
    return NextResponse.json({ error: "sourceRef is required" }, { status: 400 });
  }
  if (!body.role || !VALID_ROLES.has(body.role)) {
    return NextResponse.json({ error: `role must be one of: ${[...VALID_ROLES].join(", ")}` }, { status: 400 });
  }
  if (body.status !== undefined && !VALID_STATUSES.has(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${[...VALID_STATUSES].join(", ")}` }, { status: 400 });
  }
  if (body.scopeIds !== undefined && !Array.isArray(body.scopeIds)) {
    return NextResponse.json({ error: "scopeIds must be an array of Scope ids" }, { status: 400 });
  }

  const registration = await prisma.sourceRegistration.create({
    data: {
      sourceType: body.sourceType.trim(),
      sourceRef: body.sourceRef.trim(),
      scopeIds: body.scopeIds ?? [],
      role: body.role,
      status: body.status ?? "candidate",
      rationale: body.rationale?.trim() || null,
    },
  });

  return NextResponse.json({ registration }, { status: 201 });
}
