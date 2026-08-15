import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAllocations, asCapacityResolution } from "@/lib/capacity/resolve";

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

// Which "named" Scopes would be left with no active contributor if the
// given people's allocations were replaced by `toWrite`. Shared by the
// allocation write below and by person deletion, which can empty a roster
// just as effectively by removing the last person on it.
async function namedScopesEmptiedBy(
  replacedPersonIds: string[],
  toWrite: { personId: string; scopeId: string; fraction: number }[]
): Promise<{ id: string; name: string }[]> {
  const namedScopes = await prisma.scope.findMany({
    where: { capacityResolution: "named" },
    select: { id: true, name: true },
  });
  if (namedScopes.length === 0) return [];

  const replaced = new Set(replacedPersonIds);
  // Everyone else's committed rows survive this write untouched.
  const survivors = await prisma.allocation.findMany({
    where: { personId: { notIn: replacedPersonIds }, fraction: { gt: 0 } },
    select: { scopeId: true, person: { select: { active: true } } },
  });

  const stillStaffed = new Set<string>();
  for (const a of survivors) if (a.person.active) stillStaffed.add(a.scopeId);

  const activeIds = new Set(
    (await prisma.person.findMany({ where: { id: { in: [...replaced] }, active: true }, select: { id: true } })).map(
      (p) => p.id
    )
  );
  for (const a of toWrite) if (a.fraction > 0 && activeIds.has(a.personId)) stillStaffed.add(a.scopeId);

  return namedScopes.filter((s) => !stillStaffed.has(s.id));
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
  const scopeRows = await prisma.scope.findMany({ where: { id: { in: scopeIds } }, select: { id: true, name: true } });
  if (scopeRows.length !== scopeIds.length) {
    return NextResponse.json({ error: "One or more scopeId values don't exist" }, { status: 400 });
  }

  // Drop zero/near-zero fractions rather than storing dead rows -- a
  // slider dragged to 0 means "no allocation," not "an allocation of 0."
  const toWrite = body.allocations.filter((a) => a.fraction! > 1e-6) as Required<AllocationInput>[];

  // Server-side invariant, independent of any UI: this endpoint edits a
  // roster, and only a Scope that HAS a roster has one to edit. A Scope
  // declared at "team" resolution is described by a single number standing
  // in for whoever is on it (see Scope.capacityResolution) -- writing an
  // allocation here would re-model the Scope as person-level while
  // knowing only whoever happens to be in THIS request, silently replacing
  // a 10 FTE team with however few names were sent.
  //
  // Changing resolution is a deliberate operation with its own endpoint,
  // POST /api/scopes/:id/capacity-resolution, which requires a non-empty
  // roster and checks the portfolio invariant. This check keys on the
  // declared resolution rather than on "are there any rows yet", so a
  // Scope cannot be converted by accident from any caller -- UI, script or
  // otherwise.
  const scopesToWrite = [...new Set(toWrite.map((a) => a.scopeId))];
  if (scopesToWrite.length > 0) {
    const targets = await prisma.scope.findMany({
      where: { id: { in: scopesToWrite } },
      select: { id: true, name: true, capacityResolution: true },
    });
    const teamScopes = targets.filter((s) => asCapacityResolution(s.capacityResolution) !== "named");
    if (teamScopes.length > 0) {
      const names = teamScopes.map((s) => s.name);
      const one = teamScopes.length === 1;
      return NextResponse.json(
        {
          error:
            `Can't write a person-level allocation onto ${names.join(", ")} -- ` +
            `${one ? "it is" : "they are"} tracked as a team estimate, not as a roster, so there is nobody here to move ` +
            `someone alongside. Naming people does not add capacity; it changes how ${one ? "this Scope is" : "these Scopes are"} ` +
            `modelled. Do that deliberately via POST /api/scopes/:id/capacity-resolution, or change the estimate itself with ` +
            `PATCH /api/scopes/:id.`,
          scopeIds: teamScopes.map((s) => s.id),
        },
        { status: 409 }
      );
    }
  }

  // A named Scope must never end up with nobody on it. Its capacity would
  // be 0, and buildForecastInputs treats a non-positive capacity as "no
  // number configured" and infers one from Linear assignees -- so an
  // emptied roster would silently resurface as a made-up team size rather
  // than as the absence it actually is. Saying "we no longer track who is
  // here" is a resolution change, with its own endpoint.
  const emptied = await namedScopesEmptiedBy(personIds, toWrite);
  if (emptied.length > 0) {
    const one = emptied.length === 1;
    return NextResponse.json(
      {
        error:
          `This would leave ${emptied.map((s) => s.name).join(", ")} with nobody on ${one ? "it" : "them"}. ` +
          `${one ? "That Scope is" : "Those Scopes are"} tracked by named people, so an empty roster has no capacity ` +
          `and no honest forecast. Reassign someone, or switch ${one ? "it" : "them"} back to a team estimate via ` +
          `POST /api/scopes/:id/capacity-resolution.`,
        scopeIds: emptied.map((s) => s.id),
      },
      { status: 409 }
    );
  }

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
