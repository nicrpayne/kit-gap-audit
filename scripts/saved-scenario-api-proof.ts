import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { GET as listRoute, POST as createRoute } from "../app/api/scenarios/route";
import { GET as detailRoute, PATCH as updateRoute } from "../app/api/scenarios/[id]/route";
import {
  MAX_SAVED_SCENARIO_REQUEST_BYTES,
  SAVED_SCENARIO_PAYLOAD_VERSION,
  buildSavedScenarioBaseline,
  type SavedScenarioBaselineSource,
  type SavedScenarioPayloadV1,
} from "../lib/scenario/saved";
import { withSavedScenarioPortfolioReaderForProof } from "../lib/scenario/savedStore";

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

const baseUrl = "http://signal.local";
const noStore = "private, no-store, max-age=0, must-revalidate";
const runKey = `saved-api-${Date.now().toString(36)}`;

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

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`${baseUrl}${path}`, init);
}

function jsonRequest(path: string, method: "POST" | "PATCH", body: unknown, headers: Record<string, string> = {}) {
  return request(path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function itemContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function assertNoStore(response: Response) {
  assert.equal(response.headers.get("cache-control"), noStore);
}

async function main() {
  let fixture: SavedScenarioBaselineSource = { startDate: new Date("2026-10-07T12:00:00.000Z"), scopes: [], decisions: [], people: [], allocations: [], contextSwitchCostPct: 0 };
  let sourceFailure: Error | null = null;
  const baseline = await buildSavedScenarioBaseline(fixture);
  const name = `API route option ${runKey}`;
  let scenarioId: string | null = null;

  await withSavedScenarioPortfolioReaderForProof(async () => {
    if (sourceFailure) throw sourceFailure;
    return fixture;
  }, async () => {
    try {
      const invalidStatus = await listRoute(request("/api/scenarios?status=bogus"));
      assert.equal(invalidStatus.status, 400);
      assertNoStore(invalidStatus);

      const unknownCreate = await createRoute(jsonRequest("/api/scenarios", "POST", { unexpected: true }));
      assert.equal(unknownCreate.status, 400);
      assert.match((await unknownCreate.json()).error, /Unsupported request fields/);
      assertNoStore(unknownCreate);

      const oversized = await createRoute(jsonRequest(
        "/api/scenarios",
        "POST",
        {},
        { "Content-Length": String(MAX_SAVED_SCENARIO_REQUEST_BYTES + 1) },
      ));
      assert.equal(oversized.status, 400);
      assert.match((await oversized.json()).error, /exceeds/);
      assertNoStore(oversized);

      const streamedOversized = await createRoute(request("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ padding: "x".repeat(MAX_SAVED_SCENARIO_REQUEST_BYTES + 1) }),
      }));
      assert.equal(streamedOversized.status, 400);
      assert.match((await streamedOversized.json()).error, /exceeds/);
      assertNoStore(streamedOversized);

      const createBody = { name, payload: payload(5), baseline, idempotencyKey: `${runKey}:create` };
      const createdResponse = await createRoute(jsonRequest("/api/scenarios", "POST", createBody));
      assert.equal(createdResponse.status, 201);
      assertNoStore(createdResponse);
      const created = await createdResponse.json();
      scenarioId = created.scenario.id;
      const id = scenarioId!;
      assert.equal(created.scenario.revision, 1);
      assert.equal(created.scenario.freshness.state, "current");

      const createRetry = await createRoute(jsonRequest("/api/scenarios", "POST", createBody));
      assert.equal(createRetry.status, 200);
      assertNoStore(createRetry);
      const createRetryBody = await createRetry.json();
      assert.equal(createRetryBody.reused, true);
      assert.equal(createRetryBody.scenario.id, scenarioId);
      assert.equal(await prisma.savedScenario.count({ where: { id } }), 1);

      const listResponse = await listRoute(request("/api/scenarios?status=active"));
      assert.equal(listResponse.status, 200);
      assertNoStore(listResponse);
      const listBody = await listResponse.json();
      const listed = listBody.scenarios.find((row: { id: string }) => row.id === id);
      assert.ok(listed);
      assert.equal("payload" in listed, false, "list route must remain summary-only");

      const detailResponse = await detailRoute(request(`/api/scenarios/${id}`), itemContext(id));
      assert.equal(detailResponse.status, 200);
      assertNoStore(detailResponse);
      const detail = await detailResponse.json();
      assert.equal(detail.scenario.payload.contextSwitchCostPct, 5);
      assert.equal(detail.scenario.freshness.state, "current");

      const unknownUpdate = await updateRoute(
        jsonRequest(`/api/scenarios/${id}`, "PATCH", { expectedRevision: 1, idempotencyKey: `${runKey}:unknown`, mystery: true }),
        itemContext(id),
      );
      assert.equal(unknownUpdate.status, 400);
      assert.match((await unknownUpdate.json()).error, /Unsupported request fields/);
      assertNoStore(unknownUpdate);

      const updateBody = {
        expectedRevision: 1,
        idempotencyKey: `${runKey}:update`,
        payload: payload(7),
        baseline,
      };
      const updatedResponse = await updateRoute(jsonRequest(`/api/scenarios/${id}`, "PATCH", updateBody), itemContext(id));
      assert.equal(updatedResponse.status, 200);
      assertNoStore(updatedResponse);
      const updated = await updatedResponse.json();
      assert.equal(updated.scenario.name, name);
      assert.equal(updated.scenario.revision, 2);
      assert.equal(updated.scenario.payload.contextSwitchCostPct, 7);

      const updateRetry = await updateRoute(jsonRequest(`/api/scenarios/${id}`, "PATCH", updateBody), itemContext(id));
      assert.equal(updateRetry.status, 200);
      assertNoStore(updateRetry);
      const updateRetryBody = await updateRetry.json();
      assert.equal(updateRetryBody.reused, true);
      assert.equal(updateRetryBody.scenario.revision, 2);

      const renameBody = {
        expectedRevision: 2,
        idempotencyKey: `${runKey}:rename`,
        name: `${name} renamed`,
      };
      const renamedResponse = await updateRoute(jsonRequest(`/api/scenarios/${id}`, "PATCH", renameBody), itemContext(id));
      assert.equal(renamedResponse.status, 200);
      assertNoStore(renamedResponse);
      const renamed = await renamedResponse.json();
      assert.equal(renamed.scenario.name, `${name} renamed`);
      assert.equal(renamed.scenario.revision, 3);
      assert.equal(renamed.scenario.payload.contextSwitchCostPct, 7);

      const renameRetry = await updateRoute(jsonRequest(`/api/scenarios/${id}`, "PATCH", renameBody), itemContext(id));
      assert.equal(renameRetry.status, 200);
      assertNoStore(renameRetry);
      const renameRetryBody = await renameRetry.json();
      assert.equal(renameRetryBody.reused, true);
      assert.equal(renameRetryBody.scenario.revision, 3);

      const staleRevision = await updateRoute(jsonRequest(`/api/scenarios/${id}`, "PATCH", {
        expectedRevision: 1,
        idempotencyKey: `${runKey}:stale-revision`,
        name: "Stale writer",
      }), itemContext(id));
      assert.equal(staleRevision.status, 409);
      assert.match((await staleRevision.json()).error, /expected revision 1, current revision 3/);
      assertNoStore(staleRevision);

      fixture = { ...fixture, contextSwitchCostPct: 1 };
      const staleDetailResponse = await detailRoute(request(`/api/scenarios/${id}`), itemContext(id));
      assert.equal(staleDetailResponse.status, 200);
      assertNoStore(staleDetailResponse);
      const staleDetail = await staleDetailResponse.json();
      assert.equal(staleDetail.scenario.freshness.state, "stale");
      assert.equal(staleDetail.scenario.payload.contextSwitchCostPct, 7, "stale read must preserve the saved payload");
      assert.equal(staleDetail.scenario.baseline.fingerprint, baseline.fingerprint, "stale read must preserve the saved baseline");

      sourceFailure = new Error("Local portfolio fixture unavailable");
      const unavailableDetailResponse = await detailRoute(request(`/api/scenarios/${id}`), itemContext(id));
      assert.equal(unavailableDetailResponse.status, 200);
      assertNoStore(unavailableDetailResponse);
      const unavailableDetail = await unavailableDetailResponse.json();
      assert.equal(unavailableDetail.scenario.freshness.state, "unavailable");
      assert.match(unavailableDetail.scenario.freshness.reason, /Local portfolio fixture unavailable/);

      const unavailableListResponse = await listRoute(request("/api/scenarios?status=all"));
      assert.equal(unavailableListResponse.status, 200);
      assertNoStore(unavailableListResponse);
      assert.match((await unavailableListResponse.json()).freshnessWarning, /Local portfolio fixture unavailable/);

      const unavailableCreate = await createRoute(jsonRequest("/api/scenarios", "POST", {
        name: `${name} unavailable`,
        payload: payload(6),
        baseline,
        idempotencyKey: `${runKey}:source-unavailable`,
      }));
      assert.equal(unavailableCreate.status, 503);
      assert.match((await unavailableCreate.json()).error, /was not saved/);
      assertNoStore(unavailableCreate);

      const archiveBody = {
        expectedRevision: 3,
        idempotencyKey: `${runKey}:archive`,
        archived: true,
        archiveReason: "API proof",
      };
      const archiveResponse = await updateRoute(jsonRequest(`/api/scenarios/${id}`, "PATCH", archiveBody), itemContext(id));
      assert.equal(archiveResponse.status, 200, "archive metadata does not pretend source freshness is required");
      assertNoStore(archiveResponse);
      const archived = await archiveResponse.json();
      assert.equal(archived.scenario.status, "archived");
      assert.equal(archived.scenario.revision, 4);
      assert.equal(archived.scenario.freshness.state, "unavailable");

      const archiveRetry = await updateRoute(jsonRequest(`/api/scenarios/${id}`, "PATCH", archiveBody), itemContext(id));
      assert.equal(archiveRetry.status, 200);
      assertNoStore(archiveRetry);
      const archiveRetryBody = await archiveRetry.json();
      assert.equal(archiveRetryBody.reused, true);
      assert.equal(archiveRetryBody.scenario.revision, 4);

      const archivedListResponse = await listRoute(request("/api/scenarios?status=archived"));
      assert.equal(archivedListResponse.status, 200);
      assertNoStore(archivedListResponse);
      assert.ok((await archivedListResponse.json()).scenarios.some((row: { id: string }) => row.id === id));

      const activeListResponse = await listRoute(request("/api/scenarios?status=active"));
      assert.equal(activeListResponse.status, 200);
      assertNoStore(activeListResponse);
      assert.equal((await activeListResponse.json()).scenarios.some((row: { id: string }) => row.id === id), false);

      const allListResponse = await listRoute(request("/api/scenarios?status=all"));
      assert.equal(allListResponse.status, 200);
      assertNoStore(allListResponse);
      assert.ok((await allListResponse.json()).scenarios.some((row: { id: string }) => row.id === id));

      console.log("saved-scenario-api-proof: real NextRequest handlers passed declared/streamed limits, strict fields, no-store list/detail, idempotent create/update/rename/archive, stale preservation, source-unavailable warning/503, revision conflicts, and status filtering");
    } finally {
      if (scenarioId) await prisma.savedScenario.deleteMany({ where: { id: scenarioId } });
      await prisma.savedScenario.deleteMany({ where: { name: { startsWith: name } } });
    }
  });
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
