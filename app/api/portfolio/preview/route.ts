import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildPortfolioInputs } from "@/lib/forecast/compute";
import { validateAllocations, type PersonLike, type AllocationLike } from "@/lib/capacity/resolve";
import { runPortfolioSimulation, DependencyCycleError, MissingDependencyError } from "@/lib/forecast/portfolio";
import { applyScenarioInputDelta, type ScenarioInputDelta, type ScenarioInputScope } from "@/lib/scenario/inputDelta";
import { compareToBaseline } from "@/lib/scenario/compare";

interface AllocationOverrideInput {
  personId?: string;
  scopeId?: string;
  fraction?: number;
}

interface HypotheticalPersonInput {
  id?: string;
  name?: string;
  fte?: number;
}

// Preview-only: accepts a hypothetical allocation set -- optionally
// including people who don't exist yet ("what if we hired one more
// developer"), via hypotheticalPeople -- and returns every Scope's
// baseline (today's saved allocations) and preview (the hypothetical)
// forecast side by side. Persists nothing.
//
// Both the baseline and the preview are produced by calling
// runPortfolioSimulation ONCE EACH over every Scope together -- the exact
// lockstep orchestration lib/forecast/compute.ts's computeForecast also
// uses for the saved path. There is no separate "recompute this scope"
// implementation here: for a Scope with no dependencies this is provably
// identical to simulating it alone (see ROADMAP.md), so running every
// Scope through the same call, dependencies or not, is both simpler and
// the only way to guarantee this preview path can't silently drift from
// the saved path's correlated-risk behavior -- the exact bug the lockstep
// rewrite this session fixed, reintroduced in a new place.
export async function POST(req: NextRequest) {
  let body: {
    allocations?: AllocationOverrideInput[];
    contextSwitchCostPct?: number;
    hypotheticalPeople?: HypotheticalPersonInput[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.allocations)) {
    return NextResponse.json({ error: "allocations must be an array" }, { status: 400 });
  }
  if (
    body.contextSwitchCostPct !== undefined &&
    (typeof body.contextSwitchCostPct !== "number" ||
      body.contextSwitchCostPct < 0 ||
      body.contextSwitchCostPct > 100)
  ) {
    return NextResponse.json(
      { error: "contextSwitchCostPct must be a number between 0 and 100" },
      { status: 400 }
    );
  }

  const seenPairs = new Set<string>();
  for (const a of body.allocations) {
    if (!a.personId || !a.scopeId || typeof a.fraction !== "number" || a.fraction < 0) {
      return NextResponse.json(
        { error: "each allocation needs personId, scopeId, and a non-negative numeric fraction" },
        { status: 400 }
      );
    }
    const pairKey = `${a.personId}::${a.scopeId}`;
    if (seenPairs.has(pairKey)) {
      return NextResponse.json(
        { error: `Duplicate allocation for the same person and scope: personId=${a.personId}, scopeId=${a.scopeId}` },
        { status: 400 }
      );
    }
    seenPairs.add(pairKey);
  }

  const hypotheticalPeopleInput = body.hypotheticalPeople ?? [];
  for (const p of hypotheticalPeopleInput) {
    if (!p.id?.trim() || !p.name?.trim()) {
      return NextResponse.json({ error: "each hypotheticalPeople entry needs an id and a name" }, { status: 400 });
    }
    if (p.fte !== undefined && (typeof p.fte !== "number" || p.fte <= 0 || p.fte > 1)) {
      return NextResponse.json(
        { error: "hypotheticalPeople fte must be a number between 0 (exclusive) and 1" },
        { status: 400 }
      );
    }
  }

  // Cheap DB-only checks (person/scope references, over-allocation) happen
  // BEFORE the expensive Linear-touching buildPortfolioInputs fetch below,
  // so a typo'd id or an over-allocated hypothetical fails fast rather
  // than paying for every Scope's ticket fetch first.
  const [realPeopleRows, scopeIdRows] = await Promise.all([
    prisma.person.findMany(),
    prisma.scope.findMany({ select: { id: true } }),
  ]);

  const realPersonIds = new Set(realPeopleRows.map((p) => p.id));
  const hypotheticalIds = new Set<string>();
  const hypotheticalPeople: PersonLike[] = [];
  for (const p of hypotheticalPeopleInput) {
    const id = p.id!.trim();
    if (realPersonIds.has(id)) {
      return NextResponse.json(
        { error: `hypotheticalPeople id "${id}" collides with an existing Person -- use their real id in allocations instead` },
        { status: 400 }
      );
    }
    if (hypotheticalIds.has(id)) {
      return NextResponse.json({ error: `Duplicate hypotheticalPeople id: ${id}` }, { status: 400 });
    }
    hypotheticalIds.add(id);
    hypotheticalPeople.push({ id, name: p.name!.trim(), fte: p.fte ?? 1.0, active: true });
  }

  const scopeIds = new Set(scopeIdRows.map((s) => s.id));
  const previewPeople: PersonLike[] = [...realPeopleRows, ...hypotheticalPeople];
  const knownPersonIds = new Set(previewPeople.map((p) => p.id));

  for (const a of body.allocations) {
    if (!knownPersonIds.has(a.personId!)) {
      return NextResponse.json({ error: `Unknown person id in allocations: ${a.personId}` }, { status: 400 });
    }
    if (!scopeIds.has(a.scopeId!)) {
      return NextResponse.json({ error: `Unknown scope id in allocations: ${a.scopeId}` }, { status: 400 });
    }
  }

  // Same "drop dead-zero rows" convention as PUT /api/allocations.
  const previewAllocations: AllocationLike[] = body.allocations
    .filter((a) => a.fraction! > 1e-6)
    .map((a) => ({ personId: a.personId!, scopeId: a.scopeId!, fraction: a.fraction! }));

  const validationErrors = validateAllocations(previewPeople, previewAllocations);
  if (validationErrors.length > 0) {
    return NextResponse.json(
      {
        error: "One or more people are over-allocated in this hypothetical (fractions sum past 1.0)",
        details: validationErrors,
      },
      { status: 400 }
    );
  }

  let portfolio;
  try {
    portfolio = await buildPortfolioInputs();
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't read tickets from Linear: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }

  const previewSwitchCostPct = body.contextSwitchCostPct ?? portfolio.contextSwitchCostPct;

  // Both specs are built through the one shared transform (see
  // lib/scenario/inputDelta.ts) -- no second, hand-rolled spec-building
  // implementation lives in this route any more. The baseline delta is
  // constructed from Reality's own saved allocations/people, which
  // applyScenarioInputDelta's doc comment establishes reproduces the
  // originally-resolved capacity exactly, including the inferred-from-
  // assignees rung, without re-deriving it from Linear.
  const scenarioScopes: ScenarioInputScope[] = portfolio.scopes.map((s) => ({
    scopeId: s.scopeId,
    items: s.items,
    gates: s.gates,
    dependsOnScopeIds: s.dependsOnScopeIds,
    explicitTeamCapacity: s.explicitTeamCapacity,
    teamCapacity: s.teamCapacity,
    capacitySource: s.capacitySource,
    startDate: portfolio.startDate,
    targetDate: s.targetDate,
  }));

  const baselineDelta: ScenarioInputDelta = {
    allocations: portfolio.allocations.map((a) => ({
      personId: a.personId,
      scopeId: a.scopeId,
      fraction: a.fraction,
    })),
    hypotheticalPeople: [],
    contextSwitchCostPct: portfolio.contextSwitchCostPct,
  };
  const baselineSpecs = applyScenarioInputDelta(scenarioScopes, portfolio.people, baselineDelta);

  const previewDelta: ScenarioInputDelta = {
    allocations: previewAllocations,
    hypotheticalPeople,
    contextSwitchCostPct: previewSwitchCostPct,
  };
  const previewSpecs = applyScenarioInputDelta(scenarioScopes, realPeopleRows, previewDelta);
  const previewCapacityByScope = new Map(previewSpecs.map((s) => [s.scopeId, s.teamCapacity]));

  try {
    const baselineResults = runPortfolioSimulation(baselineSpecs);
    const previewResults = runPortfolioSimulation(previewSpecs);

    const scopes = portfolio.scopes.map((s) => {
      const b = baselineResults.get(s.scopeId)!;
      const p = previewResults.get(s.scopeId)!;
      return {
        scopeId: s.scopeId,
        name: s.name,
        baseline: {
          likelyDate: b.likelyDate,
          earliestDate: b.earliestDate,
          latestDate: b.latestDate,
          confidenceAtTarget: b.confidenceAtTarget,
          teamCapacity: s.teamCapacity,
        },
        preview: {
          likelyDate: p.likelyDate,
          earliestDate: p.earliestDate,
          latestDate: p.latestDate,
          confidenceAtTarget: p.confidenceAtTarget,
          teamCapacity: previewCapacityByScope.get(s.scopeId)!,
        },
        deltaDays: compareToBaseline(b, p).deltaDays,
      };
    });

    return NextResponse.json({ scopes });
  } catch (error) {
    if (error instanceof DependencyCycleError || error instanceof MissingDependencyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
