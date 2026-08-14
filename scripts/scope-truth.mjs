// Engine-truth probe for the Scope instrument. Not part of the app build.
//
// Answers, against the REAL payload the suite runs on: for every Scope,
// which single work-item cut actually moves the likely date, and which cuts
// are absorbed by something else (a dependency's own completion, or the
// serial decision delay). The Scope instrument's central claim -- that you
// can see when a cut is dominated -- is only worth building if the engine
// genuinely produces both outcomes. This prints the evidence.
//
//   node scripts/scope-truth.mjs
import { runPortfolioSimulation } from "../lib/forecast/portfolio.ts";

const BASE = "http://localhost:3000";
const res = await fetch(`${BASE}/api/instrument/project`);
if (!res.ok) {
  console.error("payload fetch failed", res.status, await res.text());
  process.exit(1);
}
const data = await res.json();
const startDate = new Date(data.startDate);

const specsFrom = (excluded = new Set()) =>
  data.scopes.map((s) => ({
    scopeId: s.scopeId,
    items: s.items.filter((i) => !excluded.has(i.id)),
    gates: s.gates,
    teamCapacity: s.teamCapacity,
    dependsOnScopeIds: s.dependsOnScopeIds,
    startDate,
    targetDate: s.targetDate ? new Date(s.targetDate) : null,
  }));

const day = (d) => Math.round((d.getTime() - startDate.getTime()) / 86400000);
const base = runPortfolioSimulation(specsFrom());

console.log("=== REALITY ===");
for (const s of data.scopes) {
  const r = base.get(s.scopeId);
  const effort = s.items.reduce((a, i) => a + i.likely, 0);
  console.log(
    `${s.name.padEnd(9)} items=${String(s.items.length).padStart(2)} gates=${s.gates.length} ` +
      `cap=${s.teamCapacity.toFixed(1).padStart(4)} (${s.capacitySource}) ` +
      `effort=${effort.toFixed(0).padStart(3)}d  own=${(effort / s.teamCapacity).toFixed(1).padStart(5)}d ` +
      `P50=+${String(day(r.likelyDate)).padStart(3)}d  depends=[${s.dependsOnScopeIds.join(",")}]`
  );
}

console.log("\n=== SINGLE-ITEM CUTS: does the date actually move? ===");
for (const s of data.scopes) {
  const b = day(base.get(s.scopeId).likelyDate);
  const rows = s.items
    .map((i) => {
      const sim = runPortfolioSimulation(specsFrom(new Set([i.id])));
      return { item: i, moved: day(sim.get(s.scopeId).likelyDate) - b };
    })
    .sort((a, z) => a.moved - z.moved);
  console.log(`\n-- ${s.name} (Reality P50 = +${b}d) --`);
  for (const r of rows.slice(0, 4))
    console.log(
      `   ${String(r.moved).padStart(4)}d  ${r.item.likely.toFixed(1).padStart(5)}d likely  ${r.item.label.slice(0, 62)}`
    );
  const nil = rows.filter((r) => r.moved === 0).length;
  console.log(`   ...${nil}/${rows.length} cuts move the date by exactly 0 days`);
}

console.log("\n=== WHOLE-SCOPE CUT: the ceiling on what cutting can buy ===");
for (const s of data.scopes) {
  const b = day(base.get(s.scopeId).likelyDate);
  const all = new Set(s.items.map((i) => i.id));
  const sim = runPortfolioSimulation(specsFrom(all));
  const floor = day(sim.get(s.scopeId).likelyDate);
  console.log(
    `${s.name.padEnd(9)} Reality +${String(b).padStart(3)}d -> with EVERY item cut +${String(floor).padStart(3)}d ` +
      `(irreducible floor; ${floor > 0 ? "gates/dependency set it" : "nothing left"})`
  );
}
