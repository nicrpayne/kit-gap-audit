import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAllocations, asCapacityResolution } from "@/lib/capacity/resolve";

// CHANGING HOW PRECISELY WE KNOW A TEAM -- the one place allocation
// resolution moves.
//
// There is a single portfolio capacity pool. Naming people does not add to
// it; it says, more precisely, where capacity that already existed is
// going. So this endpoint never changes how much capacity exists -- it
// changes which description of a Scope's team the forecast reads, and it
// makes that a deliberate, named operation instead of a side effect of
// dragging a slider.
//
// Deliberately NOT part of PUT /api/allocations. That endpoint edits a
// roster; this one decides whether the Scope has a roster at all. Keeping
// them apart is what stops an ordinary allocation edit from silently
// re-modelling a Scope -- the bug this whole change exists to remove.

interface RosterEntry {
  personId?: string;
  fraction?: number;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { resolution?: string; roster?: RosterEntry[]; teamCapacity?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.resolution !== "named" && body.resolution !== "team") {
    return NextResponse.json({ error: `resolution must be "named" or "team"` }, { status: 400 });
  }
  const target = body.resolution;

  const scope = await prisma.scope.findUnique({
    where: { id },
    select: { id: true, name: true, teamCapacity: true, capacityResolution: true },
  });
  if (!scope) return NextResponse.json({ error: "Scope not found" }, { status: 404 });

  const current = asCapacityResolution(scope.capacityResolution);
  if (current === target) {
    return NextResponse.json({ error: `${scope.name} is already tracked at "${target}" resolution.` }, { status: 409 });
  }

  // ── team -> named ─────────────────────────────────────────────────────
  if (target === "named") {
    const roster = (body.roster ?? []).filter((r) => (r.fraction ?? 0) > 1e-6);
    for (const r of roster) {
      if (!r.personId || typeof r.fraction !== "number") {
        return NextResponse.json({ error: "each roster entry needs a personId and a numeric fraction" }, { status: 400 });
      }
      if (r.fraction < 0 || r.fraction > 1) {
        return NextResponse.json({ error: "fraction must be between 0 and 1 (a share of that person's own time)" }, { status: 400 });
      }
    }

    // A named Scope with nobody on it is not a forecastable state: the
    // engine rewrites a capacity of 0 to 1 FTE (lib/capacity/limits.ts),
    // so it would quietly report a one-person forecast for work nobody is
    // doing. Refuse rather than record that.
    if (roster.length === 0) {
      return NextResponse.json(
        {
          error:
            `Tracking ${scope.name} by name means its capacity is the people on it, and nobody is assigned. ` +
            `Assign at least one person, or leave ${scope.name} as a team estimate.`,
        },
        { status: 400 }
      );
    }

    const personIds = [...new Set(roster.map((r) => r.personId!))];
    const people = await prisma.person.findMany({ where: { id: { in: personIds } } });
    if (people.length !== personIds.length) {
      const found = new Set(people.map((p) => p.id));
      return NextResponse.json(
        { error: `Unknown person id(s): ${personIds.filter((p) => !found.has(p)).join(", ")}` },
        { status: 400 }
      );
    }
    const inactive = people.filter((p) => !p.active);
    if (inactive.length > 0) {
      return NextResponse.json(
        { error: `Can't assign inactive ${inactive.length === 1 ? "person" : "people"}: ${inactive.map((p) => p.name).join(", ")}` },
        { status: 400 }
      );
    }

    // THE PORTFOLIO INVARIANT. Everyone's committed share, across every
    // Scope, must still fit inside the person they actually are -- checked
    // against the whole allocation table, not just this Scope's slice,
    // because moving someone onto Platform spends time that is already
    // spoken for elsewhere.
    const allPeople = await prisma.person.findMany();
    const others = await prisma.allocation.findMany({ where: { scopeId: { not: id } } });
    const combined = [
      ...others.map((a) => ({ personId: a.personId, scopeId: a.scopeId, fraction: a.fraction })),
      ...roster.map((r) => ({ personId: r.personId!, scopeId: id, fraction: r.fraction! })),
    ];
    const overAllocated = validateAllocations(allPeople, combined);
    if (overAllocated.length > 0) {
      return NextResponse.json(
        {
          error:
            `That would commit more of someone's week than they have: ` +
            overAllocated.map((o) => `${o.personName} at ${Math.round(o.totalFraction * 100)}%`).join(", ") +
            `. Capacity is one fixed pool -- take the time from another Scope first.`,
          details: overAllocated,
        },
        { status: 400 }
      );
    }

    // teamCapacity is deliberately LEFT IN PLACE, dormant: it is what the
    // Scope returns to if this is ever switched back, so the conversion
    // loses no information.
    await prisma.$transaction([
      prisma.allocation.deleteMany({ where: { scopeId: id } }),
      ...roster.map((r) =>
        prisma.allocation.create({ data: { personId: r.personId!, scopeId: id, fraction: r.fraction! } })
      ),
      prisma.scope.update({ where: { id }, data: { capacityResolution: "named" } }),
    ]);

    return NextResponse.json({ scopeId: id, resolution: "named", assigned: roster.length });
  }

  // ── named -> team ─────────────────────────────────────────────────────
  // The Scope's Allocation rows are REMOVED, not left dormant. A dormant
  // row would still count toward its person's scope count and quietly
  // penalise their other Scopes through the context-switch factor (see
  // countScopesPerPerson in lib/capacity/resolve.ts) -- capacity leaking
  // out of a Scope that is no longer tracking anybody.
  const teamCapacity = body.teamCapacity ?? scope.teamCapacity;
  if (teamCapacity == null || teamCapacity <= 0) {
    return NextResponse.json(
      {
        error:
          `${scope.name} has no team estimate to fall back to. Give it a capacity in FTE to switch to team-level tracking.`,
      },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.allocation.deleteMany({ where: { scopeId: id } }),
    prisma.scope.update({ where: { id }, data: { capacityResolution: "team", teamCapacity } }),
  ]);

  return NextResponse.json({ scopeId: id, resolution: "team", teamCapacity });
}
