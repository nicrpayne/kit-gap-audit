import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAllocations } from "@/lib/capacity/resolve";

export async function GET(req: NextRequest) {
  const scopeId = req.nextUrl.searchParams.get("scopeId");
  const personId = req.nextUrl.searchParams.get("personId");
  const allocations = await prisma.allocation.findMany({
    where: {
      ...(scopeId ? { scopeId } : {}),
      ...(personId ? { personId } : {}),
    },
  });
  return NextResponse.json({ allocations });
}

interface AllocationInput {
  personId?: string;
  scopeId?: string;
  fraction?: number;
}

// Full replace, scoped to whichever people are mentioned in the payload --
// each mentioned person's entire allocation set becomes exactly what's in
// the payload for them (existing rows for that person not listed here are
// removed). People not mentioned are untouched. This is deliberately not
// a replace of the whole table: the portfolio UI (Phase 2/3) always knows
// which person it's editing and sends that person's complete new state,
// not everyone else's.
export async function PUT(req: NextRequest) {
  let body: { allocations?: AllocationInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.allocations)) {
    return NextResponse.json({ error: "allocations must be an array" }, { status: 400 });
  }

  const seenPairs = new Set<string>();
  for (const a of body.allocations) {
    if (!a.personId || !a.scopeId || typeof a.fraction !== "number") {
      return NextResponse.json(
        { error: "each allocation needs personId, scopeId, and a numeric fraction" },
        { status: 400 }
      );
    }
    if (a.fraction < 0) {
      return NextResponse.json({ error: "fraction cannot be negative" }, { status: 400 });
    }
    // (personId, scopeId) is unique per the Allocation model -- a payload
    // listing the same pair twice would otherwise hit that constraint
    // mid-transaction as an uncaught P2002, surfacing as a bare 500.
    const pairKey = `${a.personId}::${a.scopeId}`;
    if (seenPairs.has(pairKey)) {
      return NextResponse.json(
        { error: `Duplicate allocation for the same person and scope in one request: personId=${a.personId}, scopeId=${a.scopeId}` },
        { status: 400 }
      );
    }
    seenPairs.add(pairKey);
  }

  const personIds = [...new Set(body.allocations.map((a) => a.personId!))];
  if (personIds.length === 0) {
    return NextResponse.json({ allocations: [] });
  }

  const people = await prisma.person.findMany({ where: { id: { in: personIds } } });
  const foundIds = new Set(people.map((p) => p.id));
  const missing = personIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    return NextResponse.json({ error: `Unknown person id(s): ${missing.join(", ")}` }, { status: 400 });
  }

  const scopeIds = [...new Set(body.allocations.map((a) => a.scopeId!))];
  const scopeCount = await prisma.scope.count({ where: { id: { in: scopeIds } } });
  if (scopeCount !== scopeIds.length) {
    return NextResponse.json({ error: "One or more scopeId values don't exist" }, { status: 400 });
  }

  // Drop zero/near-zero fractions rather than storing dead rows -- a
  // slider dragged to 0 means "no allocation," not "an allocation of 0."
  const toWrite = body.allocations.filter((a) => a.fraction! > 1e-6) as Required<AllocationInput>[];

  const validationErrors = validateAllocations(people, toWrite);
  if (validationErrors.length > 0) {
    return NextResponse.json(
      {
        error: "One or more people are over-allocated (fractions sum past 1.0)",
        details: validationErrors,
      },
      { status: 400 }
    );
  }

  try {
    await prisma.$transaction([
      prisma.allocation.deleteMany({ where: { personId: { in: personIds } } }),
      ...toWrite.map((a) =>
        prisma.allocation.create({ data: { personId: a.personId, scopeId: a.scopeId, fraction: a.fraction } })
      ),
    ]);
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't save allocations: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 500 }
    );
  }

  const allocations = await prisma.allocation.findMany({ where: { personId: { in: personIds } } });
  return NextResponse.json({ allocations });
}
