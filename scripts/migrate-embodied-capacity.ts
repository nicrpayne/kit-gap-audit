// LEGACY CAPACITY -> EMBODIED CAPACITY UNITS.
//
// Capacity used to be sayable two ways: as people (Person + Allocation) or
// as a bare number on the Scope (teamCapacity, or an inference from Linear
// assignees when even that was missing). Holding both meant the portfolio
// could claim more capacity than it had humans -- a 10 FTE flat number on
// Platform plus a 3 FTE roster on JSA is not thirteen people.
//
// This converts every legacy number into the anonymous units it always
// stood for, so that afterwards there is exactly one way to say how big a
// team is: who is on it.
//
// THE ACCEPTANCE CRITERION IS THAT NOTHING MOVES. Each Scope's resolved
// capacity, and every Scope's forecast dates, must be identical before and
// after. Anonymous units are created dedicated to a single Scope, so they
// carry no context-switch penalty and their effective contribution equals
// their raw contribution -- which is exactly what a flat number meant.
//
// WHAT IT DELIBERATELY DOES NOT DO: guess who was shared. A legacy number
// says how much, never who, so inferring that Platform's 10 and iTrack's 5
// overlapped would be inventing a fact. Each Scope gets its own distinct
// units. The workforce total that results may therefore be larger than the
// team Nic believes he has -- that is the old model's assumption, made
// visible for the first time rather than quietly carried. The Master bus
// is where he corrects it.
//
//   npx tsx scripts/migrate-embodied-capacity.ts [--apply]
//
// Without --apply it reports the plan and proves equivalence, writing
// nothing.

import { PrismaClient } from "@prisma/client";
import { buildPortfolioInputs } from "../lib/forecast/compute";
import { runPortfolioSimulation } from "../lib/forecast/portfolio";
import { resolveCapacity } from "../lib/capacity/resolve";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const EPS = 1e-9;

// Whole people first, then one part-time unit for any remainder, so a
// capacity of 4 becomes four humans rather than an unreadable fraction.
// Deterministic: same input, same units, every run.
function unitsFor(totalFte: number): number[] {
  const whole = Math.floor(totalFte + EPS);
  const remainder = totalFte - whole;
  const units = Array.from({ length: whole }, () => 1);
  if (remainder > 1e-6) units.push(Number(remainder.toFixed(6)));
  return units;
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const [scopes, people, allocations, settings] = await Promise.all([
    prisma.scope.findMany({ select: { id: true, name: true, teamCapacity: true }, orderBy: { id: "asc" } }),
    prisma.person.findMany(),
    prisma.allocation.findMany(),
    prisma.portfolioSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  const switchPct = settings?.contextSwitchCostPct ?? 0;

  // ── BEFORE, under the LEGACY rule ────────────────────────────────────
  // allocations win; else the Scope's own number; else inference from
  // Linear. The first and third rungs are unchanged by this migration, so
  // only the middle one can move -- and that is precisely what we fix.
  const portfolio = await buildPortfolioInputs();
  const inferredByScope = new Map(portfolio.scopes.map((s) => [s.scopeId, s.teamCapacity]));

  const plan: { scopeId: string; name: string; legacy: number; source: string; units: number[] }[] = [];
  const before = new Map<string, number>();

  for (const scope of scopes) {
    const embodied = resolveCapacity(scope.id, people, allocations, switchPct);
    if (embodied.capacity !== null) {
      before.set(scope.id, embodied.capacity);
      continue; // already people -- nothing to convert
    }
    const source = (scope.teamCapacity ?? 0) > 0 ? "explicit" : "inferred";
    const legacy = source === "explicit" ? scope.teamCapacity! : inferredByScope.get(scope.id) ?? 0;
    before.set(scope.id, legacy);
    if (legacy > 1e-6) plan.push({ scopeId: scope.id, name: scope.name, legacy, source, units: unitsFor(legacy) });
  }

  console.log("── MIGRATION PLAN ────────────────────────────────────────────");
  if (plan.length === 0) console.log("  (nothing to convert -- every Scope is already embodied)");
  for (const p of plan) {
    console.log(
      `  ${p.name.padEnd(10)} ${p.legacy.toFixed(3).padStart(8)} FTE (${p.source})  ->  ` +
        `${p.units.length} unit(s): ${p.units.map((u) => u.toFixed(2)).join(", ")}`
    );
  }
  const added = plan.reduce((t, p) => t + p.legacy, 0);
  const existing = people.filter((x) => x.active).reduce((t, x) => t + x.fte, 0);
  console.log(`\n  workforce: ${existing.toFixed(2)} FTE named  +  ${added.toFixed(2)} FTE inherited  =  ${(existing + added).toFixed(2)} FTE`);

  // ── AMBIGUITY GATE ───────────────────────────────────────────────────
  // A legacy number is unambiguous about HOW MUCH and silent about WHO.
  // Reproducing the amount needs no guess. Anything that would need one
  // stops here rather than migrating on an assumption.
  const ambiguous = plan.filter((p) => !Number.isFinite(p.legacy) || p.legacy < 0);
  if (ambiguous.length > 0) {
    console.log(`\nSTOP: ${ambiguous.map((a) => a.name).join(", ")} cannot be reproduced without guessing.`);
    process.exit(2);
  }

  // ── FORECAST BEFORE ──────────────────────────────────────────────────
  const specsFrom = (capacityByScope: Map<string, number>) =>
    portfolio.scopes.map((s) => ({
      scopeId: s.scopeId,
      items: s.items,
      gates: s.gates,
      teamCapacity: capacityByScope.get(s.scopeId) ?? s.teamCapacity,
      dependsOnScopeIds: s.dependsOnScopeIds,
      startDate: portfolio.startDate,
      targetDate: s.targetDate,
    }));
  const forecastBefore = runPortfolioSimulation(specsFrom(before));

  if (!APPLY) {
    console.log("\n(dry run -- nothing written. Re-run with --apply.)");
    console.log("\nFORECAST NOW:");
    for (const [id, r] of forecastBefore) console.log(`  ${id.padEnd(10)} ${fmt(r.likelyDate)}`);
    await prisma.$disconnect();
    return;
  }

  // ── APPLY ────────────────────────────────────────────────────────────
  let index = people.filter((p) => p.synthetic).length + 1;
  for (const p of plan) {
    for (const fte of p.units) {
      const person = await prisma.person.create({
        data: { name: `Person ${String(index).padStart(2, "0")}`, fte, active: true, synthetic: true },
      });
      // Dedicated to one Scope: switchFactor is 1, so effective == raw,
      // which is exactly what the flat number asserted.
      await prisma.allocation.create({ data: { personId: person.id, scopeId: p.scopeId, fraction: 1 } });
      index++;
    }
  }
  console.log(`\napplied: created ${plan.reduce((t, p) => t + p.units.length, 0)} anonymous units`);

  // ── PROVE NOTHING MOVED ──────────────────────────────────────────────
  const [people2, allocations2] = await Promise.all([prisma.person.findMany(), prisma.allocation.findMany()]);
  const after = new Map<string, number>();
  for (const scope of scopes) {
    const r = resolveCapacity(scope.id, people2, allocations2, switchPct);
    after.set(scope.id, r.capacity ?? inferredByScope.get(scope.id) ?? 0);
  }
  const forecastAfter = runPortfolioSimulation(specsFrom(after));

  console.log("\n── EQUIVALENCE ───────────────────────────────────────────────");
  console.log("  SCOPE        capacity before   after      date before   after      OK");
  let bad = 0;
  for (const scope of scopes) {
    const cb = before.get(scope.id) ?? 0;
    const ca = after.get(scope.id) ?? 0;
    const db = forecastBefore.get(scope.id);
    const da = forecastAfter.get(scope.id);
    const capOk = Math.abs(cb - ca) < 1e-6;
    const dateOk = !!db && !!da && fmt(db.likelyDate) === fmt(da.likelyDate);
    if (!capOk || !dateOk) bad++;
    console.log(
      `  ${scope.name.padEnd(12)} ${cb.toFixed(3).padStart(8)} ${ca.toFixed(3).padStart(10)}   ` +
        `${db ? fmt(db.likelyDate) : "—"}    ${da ? fmt(da.likelyDate) : "—"}   ${capOk && dateOk ? "yes" : "NO"}`
    );
  }
  console.log(bad === 0 ? "\nMIGRATION PRESERVED EVERY CAPACITY AND EVERY DATE" : `\n${bad} SCOPE(S) MOVED — INVESTIGATE`);
  await prisma.$disconnect();
  process.exit(bad === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
