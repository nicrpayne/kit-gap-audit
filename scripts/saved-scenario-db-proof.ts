import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  SAVED_SCENARIO_BASELINE_VERSION,
  SAVED_SCENARIO_PAYLOAD_VERSION,
  buildSavedScenarioBaseline,
  type SavedScenarioPayloadV1,
} from "../lib/scenario/saved";
import {
  SAVED_SCENARIO_APP_NAMESPACE,
  SAVED_SCENARIO_WORKSPACE_KEY,
  SavedScenarioConflictError,
  createSavedScenario,
  getSavedScenario,
  listSavedScenarios,
  updateSavedScenario,
} from "../lib/scenario/savedStore";

const rawDatabaseUrl = process.env.DATABASE_URL;
if (!rawDatabaseUrl) throw new Error("Refusing to write: DATABASE_URL is required.");
const databaseUrl = new URL(rawDatabaseUrl);
const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
if (
  !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
  !loopbackHosts.has(databaseUrl.hostname) ||
  !databaseUrl.port ||
  decodeURIComponent(databaseUrl.username) !== "signal_t0_local" ||
  databaseName !== "signal_oct07_scenarios"
) {
  throw new Error("Refusing to write: DATABASE_URL must use signal_t0_local and the exact signal_oct07_scenarios database on loopback PostgreSQL with an explicit port.");
}

const runKey = `saved-scenario-proof-${Date.now().toString(36)}`;

function payload(contextSwitchCostPct: number): SavedScenarioPayloadV1 {
  return {
    version: SAVED_SCENARIO_PAYLOAD_VERSION,
    remainingEstimateByCapabilityId: {},
    decisionPlans: {},
    capacityPlan: null,
    phasedCapacityPlan: null,
    capacityOverrideByScope: {},
    excludedItemIds: [],
    includedItemIds: [],
    resolvedGateIds: [],
    estimateOverrideByItemId: {},
    knowledgeEstimateByCapabilityId: {},
    capabilityStaffingById: {},
    bypassedFeatureIds: [],
    includedCapabilityIds: [],
    draftFeatures: [],
    acceptedCandidateIds: [],
    scopeProposalSelections: [],
    contextSwitchCostPct,
  };
}

async function expectConflict(work: () => Promise<unknown>, message: RegExp) {
  await assert.rejects(work, (error: unknown) => error instanceof SavedScenarioConflictError && message.test(error.message));
}

async function main() {
  const baseline = await buildSavedScenarioBaseline({ startDate: new Date(), scopes: [], decisions: [], people: [], allocations: [], contextSwitchCostPct: 0 });
  assert.equal(baseline.version, SAVED_SCENARIO_BASELINE_VERSION);
  const name = `Launch option ${runKey}`;
  let scenarioId: string | null = null;
  let foreignId: string | null = null;
  try {
    const created = await createSavedScenario({
      name,
      payload: payload(5),
      baseline,
      idempotencyKey: `${runKey}:create`,
    });
    scenarioId = created.scenario.id;
    assert.equal(created.reused, false);
    assert.equal(created.scenario.revision, 1);
    assert.equal(created.scenario.freshness.state, "current");
    assert.equal(created.scenario.payload.contextSwitchCostPct, 5);

    const retriedCreate = await createSavedScenario({
      name,
      payload: payload(5),
      baseline,
      idempotencyKey: `${runKey}:create`,
    });
    assert.equal(retriedCreate.reused, true);
    assert.equal(retriedCreate.scenario.id, scenarioId);
    assert.equal(await prisma.savedScenario.count({ where: { name } }), 1, "create retry must not duplicate a row");
    await expectConflict(() => createSavedScenario({
      name: `${name} changed`, payload: payload(5), baseline, idempotencyKey: `${runKey}:create`,
    }), /idempotencyKey/);
    await expectConflict(() => createSavedScenario({
      name, payload: payload(5), baseline, idempotencyKey: `${runKey}:duplicate-name`,
    }), /already exists/);

    const listed = await listSavedScenarios("active");
    const listRow = listed.scenarios.find((row) => row.id === scenarioId);
    assert.ok(listRow);
    assert.equal("payload" in listRow, false, "list responses must not emit large payloads");

    const renamed = await updateSavedScenario(scenarioId, {
      expectedRevision: 1,
      idempotencyKey: `${runKey}:rename`,
      name: `${name} renamed`,
    });
    assert.equal(renamed.scenario.revision, 2);
    assert.equal(renamed.scenario.name, `${name} renamed`);
    const renameRetry = await updateSavedScenario(scenarioId, {
      expectedRevision: 1,
      idempotencyKey: `${runKey}:rename`,
      name: `${name} renamed`,
    });
    assert.equal(renameRetry.reused, true);
    assert.equal(renameRetry.scenario.revision, 2, "update retry must not increment revision twice");

    await expectConflict(() => updateSavedScenario(scenarioId!, {
      expectedRevision: 1,
      idempotencyKey: `${runKey}:stale-revision`,
      name: `${name} stale writer`,
    }), /expected revision 1, current revision 2/);

    const replaced = await updateSavedScenario(scenarioId, {
      expectedRevision: 2,
      idempotencyKey: `${runKey}:replace`,
      payload: payload(7),
      baseline,
    });
    assert.equal(replaced.scenario.revision, 3);
    assert.equal(replaced.scenario.payload.contextSwitchCostPct, 7);

    const staleBaseline = { ...baseline, fingerprint: `sha256:${"0".repeat(64)}` };
    await expectConflict(() => updateSavedScenario(scenarioId!, {
      expectedRevision: 3,
      idempotencyKey: `${runKey}:stale-baseline`,
      payload: payload(9),
      baseline: staleBaseline,
    }), /not silently rebased/);
    const afterRefusal = await getSavedScenario(scenarioId);
    assert.equal(afterRefusal.scenario.revision, 3);
    assert.equal(afterRefusal.scenario.payload.contextSwitchCostPct, 7, "failed stale save must preserve the exact prior payload");

    const archived = await updateSavedScenario(scenarioId, {
      expectedRevision: 3,
      idempotencyKey: `${runKey}:archive`,
      archived: true,
      archiveReason: "Proof completed",
    });
    assert.equal(archived.scenario.status, "archived");
    assert.equal(archived.scenario.revision, 4);
    assert.ok(archived.scenario.archivedAt);
    assert.equal((await listSavedScenarios("active")).scenarios.some((row) => row.id === scenarioId), false);
    assert.equal((await listSavedScenarios("archived")).scenarios.some((row) => row.id === scenarioId), true);

    // Simulate Reality moving after the save. Loading must return the exact
    // payload with a stale marker, never rewrite it onto today's baseline.
    await prisma.savedScenario.update({
      where: { id: scenarioId },
      data: { baseline: JSON.parse(JSON.stringify({ ...baseline, fingerprint: `sha256:${"f".repeat(64)}` })) },
    });
    const staleLoad = await getSavedScenario(scenarioId);
    assert.equal(staleLoad.scenario.freshness.state, "stale");
    assert.equal(staleLoad.scenario.payload.contextSwitchCostPct, 7);
    assert.equal(staleLoad.scenario.baseline.fingerprint, `sha256:${"f".repeat(64)}`, "load must not silently rewrite the saved baseline");

    foreignId = (await prisma.savedScenario.create({
      data: {
        appNamespace: "another-private-app",
        workspaceKey: SAVED_SCENARIO_WORKSPACE_KEY,
        name: `${name} renamed`,
        normalizedName: `${name} renamed`.toLocaleLowerCase("en-US"),
        payload: JSON.parse(JSON.stringify(payload(3))),
        baseline: JSON.parse(JSON.stringify(baseline)),
      },
    })).id;
    assert.equal((await listSavedScenarios("all")).scenarios.some((row) => row.id === foreignId), false, "server namespace must isolate other app rows");

    const mutations = await prisma.savedScenarioMutation.findMany({ where: { scenarioId } });
    assert.deepEqual(
      mutations.map((mutation) => mutation.idempotencyKey).sort(),
      [`${runKey}:archive`, `${runKey}:create`, `${runKey}:rename`, `${runKey}:replace`].sort(),
      "only successful logical mutations belong in the durable idempotency ledger",
    );

    console.log("saved-scenario-db-proof: isolated migration, create/load/list, exact payload replacement, rename, archive, namespace isolation, optimistic conflicts, fail-closed stale baseline, and durable idempotency passed");
  } finally {
    if (scenarioId) await prisma.savedScenario.deleteMany({ where: { id: scenarioId, appNamespace: SAVED_SCENARIO_APP_NAMESPACE } });
    if (foreignId) await prisma.savedScenario.deleteMany({ where: { id: foreignId } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
