import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { Prisma, PrismaClient } from "@prisma/client";
import { isDecisionBriefV1, type DecisionBriefV1 } from "../lib/reports/decisionBrief";
import { CANONICAL_REPORT_MODE_WHERE } from "../lib/reports/history";
import { buildCapacityPlanBaseline, createCapacityScenarioPlan } from "../lib/scenario/capacityPlan";
import type { AcceptedCapabilityEstimate } from "../lib/scope/knowledgeEstimates";

if (process.env.REPORTS_DB_PROOF !== "1") {
  throw new Error("Refusing to write: set REPORTS_DB_PROOF=1 only for a disposable loopback PostgreSQL database.");
}

const rawDatabaseUrl = process.env.DATABASE_URL;
if (!rawDatabaseUrl) throw new Error("DATABASE_URL is required.");
const databaseUrl = new URL(rawDatabaseUrl);
const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
if (
  !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
  !loopbackHosts.has(databaseUrl.hostname) ||
  !databaseUrl.port ||
  decodeURIComponent(databaseUrl.username) !== "signal_t0_local" ||
  !/^signal_t0_test_[0-9]+$/.test(databaseName)
) {
  throw new Error("Refusing to write: DATABASE_URL must use signal_t0_local and the exact signal_t0_test_<pid> database contract on loopback with an explicit port.");
}

// The report path must run its real computation while remaining physically
// unable to contact Linear. Fixture Scopes below carry no Notion/Figma refs,
// so those provider clients are unreachable as well.
process.env.KIT_DEV_FIXTURES = "1";
delete process.env.LINEAR_API_KEY;

const db = new PrismaClient();
const fixtureKey = randomUUID().replaceAll("-", "");
const scopeId = `reports-db-proof-${fixtureKey}`;
const personId = `reports-db-proof-person-${fixtureKey}`;
const snapshotId = `reports-db-proof-snapshot-${fixtureKey}`;
const quotedCapabilityId = `reports-db-proof-quoted-${fixtureKey}`;
const rollupCapabilityId = `reports-db-proof-rollup-${fixtureKey}`;
const hypotheticalHireId = `reports-db-proof-hire-${fixtureKey}`;
const quotedItemId = "SOF-128";
const excludedItemId = "SOF-135";
const originalQuote = "The remaining notification slice is four to eight developer days.";
const changedQuote = "A later source now describes a different range.";
let fixtureDatabaseAuthorized = false;
let applicationPrismaForCleanup: PrismaClient | null = null;
type TransactionEntry = (...args: unknown[]) => Promise<unknown>;

const acceptedEstimate: AcceptedCapabilityEstimate = {
  id: `estimate-${fixtureKey}`,
  contextSnapshotId: snapshotId,
  capabilityId: quotedCapabilityId,
  rawEstimate: "4–8 developer days",
  range: { low: 4, likely: 6, high: 8 },
  unit: "developer_days",
  basis: "remaining_capability",
  speaker: "Fixture speaker",
  owner: "Fixture owner",
  observedAt: "2026-09-25T15:00:00.000Z",
  sourceRef: `fixture-transcript-${fixtureKey}`,
  excerpt: originalQuote,
  evidenceRefs: [`fixture-passage-${fixtureKey}`],
  statement: "The source gives a 4–8 developer-day bound; this fixture uses 6 as the interpreted midpoint, not as a third quoted number.",
  confidence: "explicit",
  sourceLocator: {
    externalRef: `fixture-transcript-${fixtureKey}#passage`,
    sourceUrl: null,
    surroundingContext: "Fixture-only local evidence.",
  },
  acceptedAt: "2026-09-25T16:00:00.000Z",
  acceptedBy: "operator",
};

const baselineAllocation = { personId, scopeId, fraction: 2 / 3 };
const capacityBaseline = buildCapacityPlanBaseline({
  people: [{ id: personId, name: "Reports proof developer", fte: 1.5, externalCommitmentFte: 0.5, active: true }],
  allocations: [baselineAllocation],
  contextSwitchCostPct: 0,
  scopeRevisionById: { [scopeId]: 1 },
});
const capacityPlan = createCapacityScenarioPlan({
  baseline: capacityBaseline,
  allocations: [
    baselineAllocation,
    { personId: hypotheticalHireId, scopeId, fraction: 1 },
  ],
  hypotheticalPeople: [{
    id: hypotheticalHireId,
    name: "Explicit hypothetical 0.5 FTE hire",
    fte: 0.5,
    externalCommitmentFte: 0,
    active: true,
    origin: "hypothetical-hire",
  }],
  requiredByScope: {},
  contextSwitchCostPct: 0,
});

const scenarioSnapshot = (scenarioId: string, excluded = excludedItemId) => ({
  version: "scenario-report.v2" as const,
  scenarioId,
  baseRealityRevision: 1,
  excludedItemIds: [excluded],
  includedItemIds: [],
  resolvedGateIds: [],
  estimateOverrideByItemId: {},
  capacityOverrideByScope: { [scopeId]: 1.5 },
  capacityPlan,
  contextSwitchCostPct: null,
  excludedCapabilityIds: [],
  knowledgeEstimateByCapabilityId: {},
  capabilityStaffingById: {},
});

function basisOf(brief: DecisionBriefV1) {
  const basis = brief.forecast?.basis;
  assert(basis, "the persisted brief freezes its complete forecast basis");
  return basis;
}

function frozenEstimateOf(brief: DecisionBriefV1) {
  const estimate = basisOf(brief).capabilityEstimates.find((entry) => entry.capabilityId === quotedCapabilityId);
  assert(estimate, "the accepted quoted capability estimate is frozen into the report");
  return estimate;
}

async function rowsForComparison(comparisonId: string) {
  return db.report.findMany({
    where: {
      scopeId,
      briefSnapshot: { path: ["identity", "comparisonId"], equals: comparisonId },
    },
    orderBy: { id: "asc" },
  });
}

function serializationFailure(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code === "P2034"
    : error instanceof Error && /serializ|write conflict|deadlock/i.test(error.message);
}

async function retrySerialization<T>(operation: () => Promise<T>, onRetry: () => void, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!serializationFailure(error) || attempt === attempts) throw error;
      onRetry();
    }
  }
  throw lastError;
}

async function installSecondInsertFailureTrigger() {
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "reports_db_proof_fail_scenario" ON "Report"');
  await db.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION reports_db_proof_fail_scenario_insert()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.mode = 'scenario' THEN
        RAISE EXCEPTION 'reports DB proof forced second insertion failure';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await db.$executeRawUnsafe(`
    CREATE TRIGGER reports_db_proof_fail_scenario
    BEFORE INSERT ON "Report"
    FOR EACH ROW EXECUTE FUNCTION reports_db_proof_fail_scenario_insert()
  `);
}

async function removeSecondInsertFailureTrigger() {
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "reports_db_proof_fail_scenario" ON "Report"');
  await db.$executeRawUnsafe("DROP FUNCTION IF EXISTS reports_db_proof_fail_scenario_insert()");
}

async function assertDisposableDatabaseIsEmpty() {
  const [scopes, reports, people, settings] = await db.$transaction([
    db.scope.count(),
    db.report.count(),
    db.person.count(),
    db.portfolioSettings.count(),
  ]);
  assert.deepEqual(
    { scopes, reports, people, settings },
    { scopes: 0, reports: 0, people: 0, settings: 0 },
    "the proof refuses a non-empty database even when its name looks disposable",
  );
}

async function createFixture() {
  await db.portfolioSettings.create({ data: { id: "singleton", contextSwitchCostPct: 0 } });
  const scope = await db.scope.create({ data: {
    id: scopeId,
    name: `Reports DB proof ${fixtureKey}`,
    teamKey: "SOF",
    projectNames: ["KIT Safety (JSA and iTrack)"],
    targetDate: new Date("2027-01-31T00:00:00.000Z"),
    includeTriage: false,
    executionState: "configured",
    notionPageIds: [],
    figmaRefs: [],
    dependsOnScopeIds: [],
  } });
  await db.person.create({ data: {
    id: personId,
    name: "Reports proof developer",
    fte: 1.5,
    externalCommitmentFte: 0.5,
    active: true,
  } });
  await db.allocation.create({ data: baselineAllocation });
  await db.capacityReconciliation.create({ data: {
    scopeId,
    status: "named_exact",
    legacyAggregateFte: null,
    legacyForecastFte: 1,
    legacySource: "allocations",
    namedRawFte: 1,
    namedEffectiveFte: 1,
    completenessConfirmed: true,
    provenance: { kind: "reports-db-proof" },
    history: [],
    reconciledAt: new Date("2026-09-25T16:00:00.000Z"),
  } });
  await db.projectDerivedState.create({ data: {
    scopeId,
    realityRevision: 1,
    computedRevision: 1,
    status: "current",
    consumers: {},
    readiness: {},
    recomputedAt: new Date("2026-09-25T16:00:00.000Z"),
  } });
  await db.contextSnapshot.create({ data: {
    id: snapshotId,
    scopeId,
    packageId: `reports-db-proof-package-${fixtureKey}`,
    packageVersion: "1.1",
    producer: `reports-db-proof-${fixtureKey}`,
    package: {
      generatedAt: "2026-09-25T15:00:00.000Z",
      sources: [],
      evidence: [],
      intelligenceObjects: [],
    },
    contextHash: `reports-db-proof-hash-${fixtureKey}`,
    completenessSummary: { status: "complete", active: [], missingActive: [] },
  } });
  await db.capability.create({ data: {
    id: quotedCapabilityId,
    scopeId,
    name: "Quoted notification slice",
    description: "Fixture capability with an accepted quoted estimate.",
    status: "accepted",
    revision: 1,
    sortOrder: 0,
    provenance: { kind: "reports-db-proof" },
    acceptedEstimate: acceptedEstimate as unknown as Prisma.InputJsonValue,
    workLinks: { create: [{
      provider: "linear",
      externalId: quotedItemId,
      externalUrl: `https://linear.app/fixture/issue/${quotedItemId}`,
      state: "active",
      provenance: { kind: "reports-db-proof" },
    }] },
  } });
  const remainingIds = Array.from({ length: 9 }, (_, index) => `SOF-${135 + index * 7}`);
  await db.capability.create({ data: {
    id: rollupCapabilityId,
    scopeId,
    name: "Execution rollup",
    description: "Fixture capability retaining ticket-level estimates.",
    status: "accepted",
    revision: 1,
    sortOrder: 1,
    provenance: { kind: "reports-db-proof" },
    workLinks: { create: remainingIds.map((externalId) => ({
      provider: "linear",
      externalId,
      externalUrl: `https://linear.app/fixture/issue/${externalId}`,
      state: "active",
      provenance: { kind: "reports-db-proof" },
    })) },
  } });
  return scope;
}

async function cleanupFixture() {
  await removeSecondInsertFailureTrigger().catch(() => undefined);
  await db.decision.deleteMany({ where: { scopeId } }).catch(() => undefined);
  await db.report.deleteMany({ where: { scopeId } }).catch(() => undefined);
  await db.contextSnapshot.deleteMany({ where: { scopeId } }).catch(() => undefined);
  await db.scope.deleteMany({ where: { id: scopeId } }).catch(() => undefined);
  await db.person.deleteMany({ where: { id: personId } }).catch(() => undefined);
  await db.portfolioSettings.deleteMany({ where: { id: "singleton" } }).catch(() => undefined);
}

async function main() {
  await assertDisposableDatabaseIsEmpty();
  // From this point cleanup is allowed. Before the emptiness assertion
  // succeeds, even deleting the singleton settings row would be unsafe.
  fixtureDatabaseAuthorized = true;
  const scope = await createFixture();

  // `server-only` is a Next build-time boundary and is intentionally absent
  // from the Node proof runtime. Stub only that marker while loading the real
  // server modules; no application dependency or behavior is replaced.
  const moduleRuntime = Module as unknown as {
    _load(request: string, parent: unknown, isMain: boolean): unknown;
  };
  const originalModuleLoad = moduleRuntime._load;
  moduleRuntime._load = function loadProofModule(request, parent, isMain) {
    if (request === "server-only") return {};
    return Reflect.apply(originalModuleLoad, this, [request, parent, isMain]);
  };
  const [{ generateReportComparison }, { loadDecisionBriefOwnerInputs }, { prisma: applicationPrisma }] = await Promise.all([
    import("../lib/reports/generate"),
    import("../lib/reports/readModel"),
    import("../lib/prisma"),
  ]).finally(() => {
    moduleRuntime._load = originalModuleLoad;
  });
  applicationPrismaForCleanup = applicationPrisma;

  const comparisonId = `comparison-success-${fixtureKey}`;
  const input = scenarioSnapshot(comparisonId);
  const pair = await generateReportComparison(scope, input);
  assert.notEqual(pair.reality.report.id, pair.scenario.report.id);
  assert.equal(pair.reality.brief.identity.mode, "reality");
  assert.equal(pair.scenario.brief.identity.mode, "scenario");
  assert.equal(pair.reality.brief.identity.comparisonId, comparisonId);
  assert.equal(pair.scenario.brief.identity.comparisonId, comparisonId);
  assert.equal(pair.reality.brief.identity.generatedAt, pair.scenario.brief.identity.generatedAt);
  assert.equal(pair.reality.brief.identity.realityRevision, 1);
  assert.equal(pair.scenario.brief.identity.realityRevision, 1);
  assert.equal(pair.reality.brief.identity.comparisonRequestHash, pair.scenario.brief.identity.comparisonRequestHash);
  const realityCapacity = basisOf(pair.reality.brief).capacity;
  const scenarioCapacity = basisOf(pair.scenario.brief).capacity;
  assert(realityCapacity && scenarioCapacity);
  assert.deepEqual(realityCapacity.namedRoster, scenarioCapacity.namedRoster, "both halves retain the same exact Reality roster baseline");
  assert.deepEqual(realityCapacity.modeledAllocations, [baselineAllocation]);
  assert.deepEqual(realityCapacity.hypotheticalHires, []);
  assert.equal(realityCapacity.namedRoster[0]?.externalCommitmentFte, 0.5, "Reality freezes the person's outside commitment");
  assert(scenarioCapacity.modeledAllocations.some((allocation) => allocation.personId === hypotheticalHireId && allocation.scopeId === scopeId && allocation.fraction === 1));
  assert.deepEqual(scenarioCapacity.hypotheticalHires, [{
    id: hypotheticalHireId,
    name: "Explicit hypothetical 0.5 FTE hire",
    fte: 0.5,
    externalCommitmentFte: 0,
    active: true,
    origin: "hypothetical-hire",
  }]);
  assert.equal(pair.reality.brief.movable.capacity.value.forecastEffectiveFte, 1);
  assert.equal(pair.scenario.brief.movable.capacity.value.forecastEffectiveFte, 1.5);
  const realityItems = basisOf(pair.reality.brief).scopes.find((item) => item.scopeId === scopeId)?.items ?? [];
  const scenarioItems = basisOf(pair.scenario.brief).scopes.find((item) => item.scopeId === scopeId)?.items ?? [];
  assert(realityItems.some((item) => item.id === excludedItemId));
  assert(!scenarioItems.some((item) => item.id === excludedItemId), "Scenario exclusion survives into the frozen simulated input");
  assert.equal(frozenEstimateOf(pair.reality.brief).estimate.excerpt, originalQuote);
  assert.equal(frozenEstimateOf(pair.scenario.brief).estimate.excerpt, originalQuote);
  assert.equal((await rowsForComparison(comparisonId)).length, 2, "a successful comparison saves exactly two rows");

  const retry = await generateReportComparison(scope, input);
  assert.equal(retry.reality.report.id, pair.reality.report.id);
  assert.equal(retry.scenario.report.id, pair.scenario.report.id);
  assert.equal((await rowsForComparison(comparisonId)).length, 2, "an identical retry returns the existing pair");

  await assert.rejects(
    () => generateReportComparison(scope, scenarioSnapshot(comparisonId, "SOF-142")),
    /comparison ID already exists with different or incomplete contents/i,
  );
  assert.equal((await rowsForComparison(comparisonId)).length, 2, "a conflicting reuse of the ID changes neither row");

  const ownerAfterPair = await loadDecisionBriefOwnerInputs(scope);
  assert.equal(ownerAfterPair.previousReport?.id, pair.reality.report.id, "Scenario history is excluded from the canonical prior-report owner read");
  const canonicalHistory = await db.report.findMany({ where: { scopeId, ...CANONICAL_REPORT_MODE_WHERE } });
  assert.deepEqual(canonicalHistory.map((row) => row.mode), ["reality"], "historical operational reads exclude Scenario artifacts");

  const concurrentId = `comparison-concurrent-${fixtureKey}`;
  const concurrentInput = scenarioSnapshot(concurrentId, "SOF-142");
  const transactionHost = applicationPrisma as unknown as { $transaction: TransactionEntry };
  const originalTransaction = transactionHost.$transaction;
  let interceptedTransactions = 0;
  let transactionArrivals = 0;
  let releaseTransactions!: () => void;
  let rejectTransactions!: (error: Error) => void;
  let barrierSettled = false;
  const transactionsReady = new Promise<void>((resolve, reject) => {
    releaseTransactions = resolve;
    rejectTransactions = reject;
  });
  const barrierTimer = setTimeout(() => {
    if (!barrierSettled) {
      barrierSettled = true;
      rejectTransactions(new Error("Concurrent report transactions did not both establish a PostgreSQL snapshot within 10 seconds."));
    }
  }, 10_000);
  transactionHost.$transaction = async (...args: unknown[]) => {
    if (typeof args[0] === "function" && interceptedTransactions < 2) {
      interceptedTransactions += 1;
      const callback = args[0] as (tx: Prisma.TransactionClient) => Promise<unknown>;
      const synchronizedCallback = async (tx: Prisma.TransactionClient) => {
        // This real relation read pins the SERIALIZABLE transaction's MVCC
        // snapshot before either generator callback can acquire its advisory
        // lock. The second callback therefore cannot observe the first one's
        // later inserts and must take the genuine serialization-retry path.
        await tx.report.count();
        transactionArrivals += 1;
        if (transactionArrivals === 2 && !barrierSettled) {
          barrierSettled = true;
          clearTimeout(barrierTimer);
          releaseTransactions();
        }
        await transactionsReady;
        return Reflect.apply(callback, undefined, [tx]) as Promise<unknown>;
      };
      return Reflect.apply(originalTransaction, applicationPrisma, [synchronizedCallback, ...args.slice(1)]) as Promise<unknown>;
    }
    return Reflect.apply(originalTransaction, applicationPrisma, args) as Promise<unknown>;
  };
  let serializationRetries = 0;
  let concurrentA: Awaited<ReturnType<typeof generateReportComparison>>;
  let concurrentB: Awaited<ReturnType<typeof generateReportComparison>>;
  try {
    [concurrentA, concurrentB] = await Promise.all([
      retrySerialization(() => generateReportComparison(scope, concurrentInput), () => { serializationRetries += 1; }),
      retrySerialization(() => generateReportComparison(scope, concurrentInput), () => { serializationRetries += 1; }),
    ]);
  } finally {
    clearTimeout(barrierTimer);
    // If one generator failed before its transaction established a snapshot,
    // release the other with an error instead of leaving a checked-out
    // connection waiting on a promise whose timeout was just cleared.
    if (!barrierSettled && transactionArrivals > 0) {
      barrierSettled = true;
      rejectTransactions(new Error("Concurrent report transaction barrier ended before both PostgreSQL snapshots were established."));
    }
    transactionHost.$transaction = originalTransaction;
  }
  assert.equal(interceptedTransactions, 2, "only the two initial interactive transactions were synchronized");
  assert.equal(transactionArrivals, 2, "both first attempts reached the transaction boundary before either insert began");
  assert(serializationRetries >= 1, "the stale concurrent serializable transaction was retried");
  assert.equal(concurrentA.reality.report.id, concurrentB.reality.report.id);
  assert.equal(concurrentA.scenario.report.id, concurrentB.scenario.report.id);
  assert.equal((await rowsForComparison(concurrentId)).length, 2, "concurrent same-ID generation converges on exactly one pair");

  const rollbackId = `comparison-rollback-${fixtureKey}`;
  await installSecondInsertFailureTrigger();
  try {
    await assert.rejects(() => generateReportComparison(scope, scenarioSnapshot(rollbackId)), /forced second insertion failure/i);
  } finally {
    await removeSecondInsertFailureTrigger();
  }
  assert.equal((await rowsForComparison(rollbackId)).length, 0, "failure of the second insert rolls the first insert back");

  // Reliably inject one owner mutation after slow assembly but before the
  // generator opens its short guarded transaction. This is the exact race
  // the second owner fingerprint is designed to close.
  const ownerRaceTransaction = applicationPrisma as unknown as { $transaction: TransactionEntry };
  const originalOwnerRaceTransaction = ownerRaceTransaction.$transaction;
  let ownerMutationId: string | null = null;
  let injected = false;
  ownerRaceTransaction.$transaction = async (...args: unknown[]) => {
    if (!injected && typeof args[0] === "function") {
      injected = true;
      ownerMutationId = (await db.decision.create({ data: {
        scopeId,
        title: "Reports DB proof owner mutation during assembly",
        status: "decided",
        resolution: "Fixture mutation used only to exercise the optimistic guard.",
        decidedAt: new Date(),
      }, select: { id: true } })).id;
    }
    return Reflect.apply(originalOwnerRaceTransaction, applicationPrisma, args) as Promise<unknown>;
  };
  const ownerRaceId = `comparison-owner-race-${fixtureKey}`;
  try {
    await assert.rejects(
      () => generateReportComparison(scope, scenarioSnapshot(ownerRaceId)),
      /Report inputs changed during generation/i,
    );
  } finally {
    ownerRaceTransaction.$transaction = originalOwnerRaceTransaction;
  }
  assert(injected && ownerMutationId, "the proof injected the owner mutation at the transaction boundary");
  assert.equal((await rowsForComparison(ownerRaceId)).length, 0, "an owner mutation fails closed with neither report saved");
  await db.decision.delete({ where: { id: ownerMutationId } });

  const persistedBeforeMutation = await db.report.findMany({ where: { id: { in: [pair.reality.report.id, pair.scenario.report.id] } }, orderBy: { id: "asc" } });
  const immutableBefore = persistedBeforeMutation.map((row) => ({ brief: row.briefSnapshot, markdown: row.summaryMarkdown, scenario: row.scenarioSnapshot }));
  await db.person.update({ where: { id: personId }, data: { name: "Changed current developer", fte: 2 } });
  await db.capability.update({ where: { id: quotedCapabilityId }, data: {
    revision: { increment: 1 },
    acceptedEstimate: {
      ...acceptedEstimate,
      range: { low: 13, likely: 21, high: 34 },
      rawEstimate: "13–21–34 developer days",
      excerpt: changedQuote,
      statement: "A newer current owner assertion has replaced the prior quote.",
    } as unknown as Prisma.InputJsonValue,
  } });
  await db.contextSnapshot.create({ data: {
    id: `reports-db-proof-later-snapshot-${fixtureKey}`,
    scopeId,
    packageId: `reports-db-proof-later-package-${fixtureKey}`,
    packageVersion: "1.1",
    producer: `reports-db-proof-later-${fixtureKey}`,
    package: { generatedAt: "2026-09-26T15:00:00.000Z", sources: [], evidence: [{ id: "later", excerpt: changedQuote }], intelligenceObjects: [] },
    contextHash: `reports-db-proof-later-hash-${fixtureKey}`,
    completenessSummary: { status: "complete", active: [], missingActive: [] },
  } });
  const persistedAfterMutation = await db.report.findMany({ where: { id: { in: [pair.reality.report.id, pair.scenario.report.id] } }, orderBy: { id: "asc" } });
  assert.deepEqual(
    persistedAfterMutation.map((row) => ({ brief: row.briefSnapshot, markdown: row.summaryMarkdown, scenario: row.scenarioSnapshot })),
    immutableBefore,
    "later capacity and quote owner changes cannot rewrite either stored half",
  );
  for (const row of persistedAfterMutation) {
    assert(isDecisionBriefV1(row.briefSnapshot));
    const frozenCapacity = basisOf(row.briefSnapshot).capacity;
    assert.equal(frozenCapacity?.namedRoster.find((person) => person.id === personId)?.fte, 1.5);
    assert.equal(frozenCapacity?.namedRoster.find((person) => person.id === personId)?.externalCommitmentFte, 0.5);
    assert.equal(frozenCapacity?.namedRoster.find((person) => person.id === personId)?.name, "Reports proof developer");
    assert.equal(frozenEstimateOf(row.briefSnapshot).estimate.excerpt, originalQuote);
    assert.notEqual(frozenEstimateOf(row.briefSnapshot).estimate.excerpt, changedQuote);
  }
  const storedScenario = persistedAfterMutation.find((row) => row.mode === "scenario");
  assert(storedScenario?.scenarioSnapshot && typeof storedScenario.scenarioSnapshot === "object" && !Array.isArray(storedScenario.scenarioSnapshot));
  assert.deepEqual((storedScenario.scenarioSnapshot as Prisma.JsonObject).excludedItemIds, [excludedItemId]);

  console.log(JSON.stringify({
    ok: true,
    database: `${databaseUrl.hostname}:${databaseUrl.port}/${databaseName}`,
    cases: {
      successfulSameBaselinePair: true,
      duplicateRetryIdempotent: true,
      concurrentRetryConverged: true,
      conflictingIdRejected: true,
      secondInsertFailureRolledBack: true,
      ownerMutationFailedClosed: true,
      capacityAndQuoteFrozen: true,
      scenarioExcludedFromHistory: true,
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (fixtureDatabaseAuthorized) await cleanupFixture();
    await applicationPrismaForCleanup?.$disconnect();
    await db.$disconnect();
  });
