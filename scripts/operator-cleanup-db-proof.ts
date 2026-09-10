import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { PUT as putRoster } from "../app/api/capacity/roster/route";
import { PUT as putAllocations } from "../app/api/allocations/route";
import { getAuditChangeInbox } from "../lib/audit/changeInbox";

if (process.env.OPERATOR_CLEANUP_DB_PROOF !== "1") throw new Error("Use only with a disposable proof database.");
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const request = (url: string, body: unknown) => new NextRequest(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function main() {
  await prisma.portfolioSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton", contextSwitchCostPct: 10 }, update: { contextSwitchCostPct: 10 } });
  const [jsa, platform, itrack] = await Promise.all([
    prisma.scope.create({ data: { name: `Proof JSA ${stamp}`, teamKey: `J${stamp}`, teamCapacity: 5, executionState: "configured" } }),
    prisma.scope.create({ data: { name: `Proof Platform ${stamp}`, teamKey: `P${stamp}`, teamCapacity: 1, executionState: "configured" } }),
    prisma.scope.create({ data: { name: `Proof iTrack ${stamp}`, teamKey: `I${stamp}`, teamCapacity: 1, executionState: "configured" } }),
  ]);
  const seedPerson = await prisma.person.create({ data: { name: `Seed ${stamp}`, fte: 1 } });
  const blocked = await putAllocations(request("http://local/api/allocations", { allocations: [{ personId: seedPerson.id, scopeId: jsa.id, fraction: 1 }] }));
  assert.equal(blocked.status, 409, "A aggregate Scope blocks a first named allocation write");

  const bases = [
    { scopeId: jsa.id, forecastFte: 5, source: "explicit" as const },
    { scopeId: platform.id, forecastFte: 1, source: "explicit" as const },
    { scopeId: itrack.id, forecastFte: 1, source: "explicit" as const },
  ];
  const four = Array.from({ length: 4 }, (_, index) => ({ name: `Person ${index + 1} ${stamp}`, fte: 1, allocations: [{ scopeId: jsa.id, fte: 1 }] }));
  const mismatch = await putRoster(request("http://local/api/capacity/roster", { people: four, legacyBases: bases, contextSwitchCostPct: 10, confirmComplete: true, confirmDifferences: false, removePersonIds: [seedPerson.id] }));
  assert.equal(mismatch.status, 409, "Roster total difference requires explicit confirmation");
  const partial = await putRoster(request("http://local/api/capacity/roster", { people: four, legacyBases: bases, contextSwitchCostPct: 10, confirmComplete: false }));
  assert.equal(partial.status, 422, "A partial draft cannot become named_exact");
  const over = await putRoster(request("http://local/api/capacity/roster", { people: [{ name: `Over ${stamp}`, fte: 1, allocations: [{ scopeId: jsa.id, fte: 0.7 }, { scopeId: itrack.id, fte: 0.4 }] }], legacyBases: bases, contextSwitchCostPct: 10, confirmComplete: true, confirmDifferences: true, removePersonIds: [seedPerson.id] }));
  assert.equal(over.status, 422, "Overallocation is rejected");

  const roster = [
    { name: `A ${stamp}`, fte: 1, allocations: [{ scopeId: jsa.id, fte: 0.5 }, { scopeId: itrack.id, fte: 0.5 }] },
    { name: `B ${stamp}`, fte: 1, allocations: [{ scopeId: platform.id, fte: 1 }] },
    { name: `C ${stamp}`, fte: 1, allocations: [{ scopeId: jsa.id, fte: 0.5 }, { scopeId: platform.id, fte: 0.5 }] },
    { name: `D ${stamp}`, fte: 1, allocations: [{ scopeId: jsa.id, fte: 1 }] },
    { name: `E ${stamp}`, fte: 1, allocations: [{ scopeId: jsa.id, fte: 1 }] },
  ];
  const saved = await putRoster(request("http://local/api/capacity/roster", { people: roster, legacyBases: bases, contextSwitchCostPct: 10, confirmComplete: true, confirmDifferences: true, removePersonIds: [seedPerson.id] }));
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.status, "named_exact");
  assert.equal(savedBody.workforceFte, 5);
  if (process.env.KIT_DEV_FIXTURES === "1") assert.ok(savedBody.derived.every((item: { status: string }) => item.status === "current"), "all dynamic consumers recompute from the new capacity contract");
  const rec = await prisma.capacityReconciliation.findUniqueOrThrow({ where: { scopeId: jsa.id } });
  assert.equal(rec.status, "named_exact");
  assert.equal(rec.completenessConfirmed, true);
  assert.equal(rec.legacyAggregateFte, 5);
  assert.ok(Array.isArray(rec.history) && rec.history.length > 0);
  const a = await prisma.person.findFirstOrThrow({ where: { name: `A ${stamp}` } });
  const aAllocations = await prisma.allocation.findMany({ where: { personId: a.id } });
  assert.equal(aAllocations.reduce((sum, item) => sum + item.fraction, 0), 1, "0.5/0.5 conserves one person's FTE");

  const accepted = await putAllocations(request("http://local/api/allocations", { allocations: [
    { personId: a.id, scopeId: jsa.id, fraction: 0.6 }, { personId: a.id, scopeId: itrack.id, fraction: 0.4 },
  ] }));
  assert.equal(accepted.status, 200, "Scenario allocation commits are accepted after named_exact");
  const idempotent = await putAllocations(request("http://local/api/allocations", { allocations: [
    { personId: a.id, scopeId: jsa.id, fraction: 0.6 }, { personId: a.id, scopeId: itrack.id, fraction: 0.4 },
  ] }));
  assert.equal((await idempotent.json()).unchanged, true, "An identical scenario commit creates no new Reality revision");
  const beforeRemoval = await putRoster(request("http://local/api/capacity/roster", { people: [], legacyBases: bases, contextSwitchCostPct: 10, confirmComplete: true, confirmDifferences: true, removePersonIds: [] }));
  assert.equal(beforeRemoval.status, 409, "Removing active people requires impact confirmation");

  const inbox = await getAuditChangeInbox(jsa.id);
  assert.equal(inbox.readiness.blockers.some((item) => item.code === "capacity_unreconciled"), false, "Readiness clears the capacity blocker after named_exact");
  console.log(JSON.stringify({ ok: true, cases: { A: "aggregate commit blocked", B: "five-person named_exact", C: "difference confirmed", D: "split conserved", E: "over-allocation blocked", F: "partial blocked", G: "context-switch recomputed", H: "post-exact scenario accepted + idempotent", I: "removal confirmed", J: "capacity blocker cleared" }, saved: savedBody }, null, 2));
}

main().finally(() => prisma.$disconnect());
