// ONE PORTFOLIO CAPACITY POOL. Not part of the app build.
//
// People are the capacity. Projects consume it. Naming someone says more
// precisely where capacity that already exists is going -- it never
// creates any. This proves that invariant directly against the functions
// the forecast actually calls, rather than through the UI, because the
// invariant is arithmetic and deserves an arithmetic test.
//
// The bug this exists to keep dead: a Scope modelled as 10 FTE, with one
// named person dragged onto it, previewing as 10.5 FTE. That invented half
// a human, and it was unpersistable, so the preview answered a different
// question from the one Commit would record.
//
//   npx tsx scripts/capacity-model-proof.ts
import { resolveCapacity, validateAllocations, hasEmptyNamedRoster } from "../lib/capacity/resolve";
import { applyScenarioInputDelta, type ScenarioInputScope } from "../lib/scenario/inputDelta";
import type { PersonLike, AllocationLike } from "../lib/capacity/resolve";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const START = new Date("2026-08-15T00:00:00Z");

const people: PersonLike[] = [
  { id: "alice", name: "Alice", fte: 1, active: true },
  { id: "bob", name: "Bob", fte: 1, active: true },
  { id: "chris", name: "Chris", fte: 1, active: true },
];

// Platform: 10 FTE, team estimate. JSA: tracked by name, Chris full-time.
const scopes = (platformResolution: "team" | "named"): ScenarioInputScope[] => [
  {
    scopeId: "platform",
    items: [{ id: "p1", label: "work", low: 8, likely: 10, high: 14 }],
    gates: [],
    dependsOnScopeIds: [],
    explicitTeamCapacity: 10,
    teamCapacity: 10,
    capacitySource: platformResolution === "named" ? "allocations" : "explicit",
    capacityResolution: platformResolution,
    startDate: START,
    targetDate: null,
  },
  {
    scopeId: "jsa",
    items: [{ id: "j1", label: "work", low: 4, likely: 6, high: 9 }],
    gates: [],
    dependsOnScopeIds: [],
    explicitTeamCapacity: null,
    teamCapacity: 1,
    capacitySource: "allocations",
    capacityResolution: "named",
    startDate: START,
    targetDate: null,
  },
];

const realityAllocations: AllocationLike[] = [{ personId: "chris", scopeId: "jsa", fraction: 1 }];
const capacityOf = (specs: ReturnType<typeof applyScenarioInputDelta>, id: string) =>
  specs.find((s) => s.scopeId === id)!.teamCapacity;

console.log("── SCENARIO A: naming people never adds capacity ──────────────");

// Alice at 50% and Bob at 100% moved onto a 10 FTE team-estimate Platform.
const withNames: AllocationLike[] = [
  ...realityAllocations,
  { personId: "alice", scopeId: "platform", fraction: 0.5 },
  { personId: "bob", scopeId: "platform", fraction: 1 },
];

const aSpecs = applyScenarioInputDelta(scopes("team"), people, {
  allocations: withNames,
  hypotheticalPeople: [],
  contextSwitchCostPct: 0,
});
const aPlatform = capacityOf(aSpecs, "platform");

check(
  "Platform stays at its team estimate, not estimate + named people",
  near(aPlatform, 10),
  `${aPlatform} FTE (the old bug produced ${10 + 1.5})`
);
check("…and specifically is NOT 11.5", !near(aPlatform, 11.5), `${aPlatform} FTE`);
check(
  "The named Scope alongside it is unaffected",
  near(capacityOf(aSpecs, "jsa"), 1),
  `${capacityOf(aSpecs, "jsa")} FTE`
);

// The same claim stated as the human invariant: total simulated capacity
// must never exceed the people who exist.
const totalPeopleFte = people.reduce((t, p) => t + p.fte, 0);
const namedTotal = capacityOf(aSpecs, "jsa");
check(
  "Named capacity across the portfolio never exceeds the actual roster",
  namedTotal <= totalPeopleFte + 1e-9,
  `${namedTotal} FTE named vs ${totalPeopleFte} FTE of people`
);

console.log("\n── SCENARIO B: converting to named forecasts from people alone ─");

const bSpecs = applyScenarioInputDelta(scopes("team"), people, {
  allocations: withNames,
  hypotheticalPeople: [],
  contextSwitchCostPct: 0,
  resolutionOverrideByScope: { platform: "named" },
});
const bPlatform = capacityOf(bSpecs, "platform");
check(
  "Converted, Platform is exactly its named people",
  near(bPlatform, 1.5),
  `${bPlatform} FTE from Alice 50% + Bob 100%`
);
check("…and the 10 FTE estimate is not added to it", bPlatform < 10, `${bPlatform} FTE, was 10`);

// The preview the dialog shows and the number Reality resolves to after
// committing must be the same. This is the divergence that made the old
// drawer dishonest.
const committed = resolveCapacity("platform", 10, people, withNames, 0, "named");
check(
  "The conversion preview equals what Reality resolves to after committing",
  near(bPlatform, committed.capacity!),
  `preview ${bPlatform} vs committed ${committed.capacity}`
);

console.log("\n── Context-switch cost starts applying on conversion ──────────");
const bSwitch = applyScenarioInputDelta(scopes("team"), people, {
  allocations: [...withNames, { personId: "alice", scopeId: "jsa", fraction: 0.5 }],
  hypotheticalPeople: [],
  contextSwitchCostPct: 20,
  resolutionOverrideByScope: { platform: "named" },
});
// Alice is now on two Scopes: factor 1 - 0.20*(2-1) = 0.8.
// Platform = 0.5*1*0.8 + 1*1*1 = 1.4
check(
  "A split contributor is discounted once the Scope is named",
  near(capacityOf(bSwitch, "platform"), 1.4),
  `${capacityOf(bSwitch, "platform")} FTE with Alice split across two Scopes`
);
const teamUnderSwitch = applyScenarioInputDelta(scopes("team"), people, {
  allocations: withNames,
  hypotheticalPeople: [],
  contextSwitchCostPct: 20,
});
check(
  "…and never applied while the Scope is still a team estimate",
  near(capacityOf(teamUnderSwitch, "platform"), 10),
  `${capacityOf(teamUnderSwitch, "platform")} FTE`
);

console.log("\n── SCENARIO C: the pool is finite ─────────────────────────────");

const overCommitted: AllocationLike[] = [
  { personId: "alice", scopeId: "platform", fraction: 1 },
  { personId: "alice", scopeId: "jsa", fraction: 1 },
];
const errors = validateAllocations(people, overCommitted);
check(
  "Alice at 100% on two Scopes is reported as over-allocated",
  errors.length === 1 && errors[0].personId === "alice",
  errors.map((e) => `${e.personName} at ${Math.round(e.totalFraction * 100)}%`).join(", ")
);
check(
  "A person split within their own week is fine",
  validateAllocations(people, [
    { personId: "alice", scopeId: "platform", fraction: 0.5 },
    { personId: "alice", scopeId: "jsa", fraction: 0.5 },
  ]).length === 0
);
// Per-person validation is what makes the portfolio-level invariant hold:
// nobody exceeds 1.0 of themselves, so the sum can never exceed the roster.
const legal: AllocationLike[] = [
  { personId: "alice", scopeId: "platform", fraction: 0.5 },
  { personId: "bob", scopeId: "platform", fraction: 1 },
  { personId: "chris", scopeId: "jsa", fraction: 1 },
];
const allocatedFte = legal.reduce((t, a) => t + a.fraction * people.find((p) => p.id === a.personId)!.fte, 0);
check(
  "Total allocated FTE never exceeds total available people",
  validateAllocations(people, legal).length === 0 && allocatedFte <= totalPeopleFte + 1e-9,
  `${allocatedFte} FTE allocated of ${totalPeopleFte} FTE available`
);

console.log("\n── An emptied named roster is 0, not a silent fallback ────────");
const emptied = resolveCapacity("jsa", 99, people, [], 0, "named");
check("A named Scope with nobody on it resolves to 0", near(emptied.capacity ?? -1, 0), `${emptied.capacity}`);
check(
  "…and does NOT fall back to a dormant estimate",
  !near(emptied.capacity ?? -1, 99),
  `${emptied.capacity} (dormant estimate was 99)`
);
check("…and is reported so callers can refuse to commit it", hasEmptyNamedRoster("jsa", people, [], "named"));
check("A team Scope is never flagged as an empty roster", !hasEmptyNamedRoster("platform", people, [], "team"));

console.log("\n── Reality reproduces itself ──────────────────────────────────");
const baseline = applyScenarioInputDelta(scopes("team"), people, {
  allocations: realityAllocations,
  hypotheticalPeople: [],
  contextSwitchCostPct: 0,
});
check(
  "A delta built from Reality reproduces Reality exactly",
  near(capacityOf(baseline, "platform"), 10) && near(capacityOf(baseline, "jsa"), 1),
  `platform ${capacityOf(baseline, "platform")}, jsa ${capacityOf(baseline, "jsa")}`
);

// The aggregate fader still short-circuits everything, on either
// resolution -- "simulate this at N" means N.
const faded = applyScenarioInputDelta(scopes("team"), people, {
  allocations: withNames,
  hypotheticalPeople: [],
  contextSwitchCostPct: 0,
  capacityOverrideByScope: { platform: 7 },
});
check("The capacity fader still overrides everything", near(capacityOf(faded, "platform"), 7), `${capacityOf(faded, "platform")} FTE`);

console.log(failures === 0 ? "\nALL PROOFS PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
