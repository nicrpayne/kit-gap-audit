import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { name?: string; fte?: number; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.name !== undefined && !body.name.trim()) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
  }
  if (body.fte !== undefined && (typeof body.fte !== "number" || body.fte <= 0 || body.fte > 1)) {
    return NextResponse.json({ error: "fte must be a number between 0 (exclusive) and 1" }, { status: 400 });
  }

  try {
    const person = await prisma.person.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.fte !== undefined ? { fte: body.fte } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    });
    return NextResponse.json({ person });
  } catch {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }
}

// Deletes the person and, via cascade, every Allocation pointing at them.
// Prefer PATCH { active: false } to remove someone from capacity planning
// without losing their allocation history -- this is for genuine mistakes.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Removing someone can empty a named Scope's roster just as effectively
  // as zeroing their allocation, and an empty roster is not a state the
  // forecast can represent honestly -- a capacity of 0 gets inferred back
  // into a made-up team size downstream (see buildForecastInputs). Refuse,
  // and name the Scopes, rather than quietly re-modelling them.
  const theirScopes = await prisma.allocation.findMany({
    where: { personId: id, fraction: { gt: 0 } },
    select: { scopeId: true },
  });
  if (theirScopes.length > 0) {
    const scopeIds = [...new Set(theirScopes.map((a) => a.scopeId))];
    const named = await prisma.scope.findMany({
      where: { id: { in: scopeIds }, capacityResolution: "named" },
      select: { id: true, name: true },
    });
    const others = await prisma.allocation.findMany({
      where: { scopeId: { in: named.map((s) => s.id) }, personId: { not: id }, fraction: { gt: 0 } },
      select: { scopeId: true, person: { select: { active: true } } },
    });
    const stillStaffed = new Set(others.filter((a) => a.person.active).map((a) => a.scopeId));
    const wouldEmpty = named.filter((s) => !stillStaffed.has(s.id));
    if (wouldEmpty.length > 0) {
      const one = wouldEmpty.length === 1;
      return NextResponse.json(
        {
          error:
            `They are the only person on ${wouldEmpty.map((s) => s.name).join(", ")}. ` +
            `Removing them would leave ${one ? "that Scope" : "those Scopes"} tracked by name with nobody on ` +
            `${one ? "it" : "them"}, which has no honest forecast. Assign someone else first, or switch ` +
            `${one ? "it" : "them"} back to a team estimate.`,
          scopeIds: wouldEmpty.map((s) => s.id),
        },
        { status: 409 }
      );
    }
  }

  try {
    await prisma.person.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
