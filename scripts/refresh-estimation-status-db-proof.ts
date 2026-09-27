import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { assertDisposableDatabaseProofEnvironment } from "./lib/disposable-db-proof-guard";

assertDisposableDatabaseProofEnvironment(process.env, "REFRESH_ESTIMATION_DB_PROOF");

// Exercise the real offline owner-read fixture and the real missing-provider
// failure. No model response is stubbed: completeJson throws because the key
// is absent, and runEstimation must turn that into failed item counts.
process.env.KIT_DEV_FIXTURES = "1";
delete process.env.LINEAR_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

type EstimateBody = {
  ok?: boolean;
  status?: string;
  complete?: boolean;
  total?: number;
  estimated?: number;
  cached?: number;
  failed?: number;
  detail?: string;
  error?: string;
};

type RefreshBody = {
  ok?: boolean;
  status?: string;
  estimate?: EstimateBody;
  forecast?: {
    likelyDate?: string;
    forecastCoverage?: { state?: string; canonicalForecast?: boolean };
  };
  error?: string;
};

async function main() {
  // `server-only` is a Next build-time marker, intentionally absent from the
  // plain Node proof runtime. Stub only that marker while loading the actual
  // route modules; estimator, forecast, Prisma, and provider behavior remain
  // real.
  const moduleRuntime = Module as unknown as {
    _load(request: string, parent: unknown, isMain: boolean): unknown;
  };
  const originalModuleLoad = moduleRuntime._load;
  moduleRuntime._load = function loadProofModule(request, parent, isMain) {
    if (request === "server-only") return {};
    return Reflect.apply(originalModuleLoad, this, [request, parent, isMain]);
  };
  const [{ NextRequest }, { POST: estimate }, { POST: refresh }, { prisma }, { getScopedIssues }, { buildReleaseContext }, { issueEstimateInputs }] = await Promise.all([
    import("next/server"),
    import("../app/api/estimate/route"),
    import("../app/api/refresh/route"),
    import("../lib/prisma"),
    import("../lib/linear"),
    import("../lib/estimate/context"),
    import("../lib/estimate/run"),
  ]).finally(() => {
    moduleRuntime._load = originalModuleLoad;
  });

  const fixtureKey = randomUUID().replaceAll("-", "");
  const scope = await prisma.scope.create({
    data: {
      id: `refresh-estimation-proof-${fixtureKey}`,
      name: "Refresh estimation receipt proof",
      teamKey: "JSA",
      projectNames: ["KIT JSA"],
      executionState: "configured",
      notionPageIds: [],
      figmaRefs: [],
    },
  });

  const request = (path: "estimate" | "refresh") => new NextRequest(`http://signal.test/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scopeId: scope.id }),
  });

  try {
    const issues = await getScopedIssues(scope);
    assert.equal(issues.length, 10, "the fixture must exercise ten real work inputs");

    const estimateFailure = await estimate(request("estimate"));
    const estimateFailureBody = await estimateFailure.json() as EstimateBody;
    assert.equal(estimateFailure.status, 200);
    assert.deepEqual({
      ok: estimateFailureBody.ok,
      status: estimateFailureBody.status,
      complete: estimateFailureBody.complete,
      total: estimateFailureBody.total,
      estimated: estimateFailureBody.estimated,
      cached: estimateFailureBody.cached,
      failed: estimateFailureBody.failed,
    }, {
      ok: false,
      status: "failed",
      complete: false,
      total: 10,
      estimated: 0,
      cached: 0,
      failed: 10,
    });
    assert.match(estimateFailureBody.detail ?? "", /all 10 items/);

    const refreshFailure = await refresh(request("refresh"));
    const refreshFailureBody = await refreshFailure.json() as RefreshBody;
    assert.equal(refreshFailure.status, 200);
    assert.equal(refreshFailureBody.ok, false);
    assert.equal(refreshFailureBody.status, "partial", "the whole refresh is partial even when its estimator stage failed");
    assert.equal(refreshFailureBody.estimate?.status, "failed");
    assert.equal(refreshFailureBody.estimate?.failed, 10);
    assert.match(refreshFailureBody.forecast?.likelyDate ?? "", /^\d{4}-\d{2}-\d{2}T/,
      "the independently computed fallback forecast remains in the response");
    assert.equal(typeof refreshFailureBody.forecast?.forecastCoverage?.state, "string");

    const context = await buildReleaseContext({ ...scope, contextDocs: [] });
    const cachedInput = issueEstimateInputs([issues[0]], context.contextHash)[0];
    await prisma.workEstimate.create({
      data: {
        scopeId: scope.id,
        source: cachedInput.source,
        externalId: cachedInput.externalId,
        contentHash: cachedInput.contentHash,
        lowDays: 2,
        likelyDays: 3,
        highDays: 5,
        relevance: "core",
        flags: [],
        rationale: "Disposable proof cache row.",
        model: "disposable-proof",
      },
    });

    const estimatePartial = await estimate(request("estimate"));
    const estimatePartialBody = await estimatePartial.json() as EstimateBody;
    assert.equal(estimatePartial.status, 200);
    assert.deepEqual({
      ok: estimatePartialBody.ok,
      status: estimatePartialBody.status,
      complete: estimatePartialBody.complete,
      total: estimatePartialBody.total,
      estimated: estimatePartialBody.estimated,
      cached: estimatePartialBody.cached,
      failed: estimatePartialBody.failed,
    }, {
      ok: false,
      status: "partial",
      complete: false,
      total: 10,
      estimated: 0,
      cached: 1,
      failed: 9,
    });
    assert.equal(await prisma.workEstimate.count({ where: { scopeId: scope.id } }), 1,
      "a provider failure must not delete a known cached estimate");

    const refreshPartial = await refresh(request("refresh"));
    const refreshPartialBody = await refreshPartial.json() as RefreshBody;
    assert.equal(refreshPartial.status, 200);
    assert.equal(refreshPartialBody.ok, false);
    assert.equal(refreshPartialBody.status, "partial");
    assert.equal(refreshPartialBody.estimate?.status, "partial");
    assert.equal(refreshPartialBody.estimate?.cached, 1);
    assert.equal(refreshPartialBody.estimate?.failed, 9);
    assert(refreshPartialBody.forecast?.likelyDate, "partial estimation must not remove the forecast result");

    console.log(JSON.stringify({
      ok: true,
      actualRoutes: {
        estimateAllFailed: { http: estimateFailure.status, status: estimateFailureBody.status, failed: estimateFailureBody.failed },
        refreshAllFailed: { http: refreshFailure.status, status: refreshFailureBody.status, estimate: refreshFailureBody.estimate?.status, forecast: true },
        estimateCachedPartial: { http: estimatePartial.status, status: estimatePartialBody.status, cached: estimatePartialBody.cached, failed: estimatePartialBody.failed },
        refreshCachedPartial: { http: refreshPartial.status, status: refreshPartialBody.status, estimate: refreshPartialBody.estimate?.status, forecast: true },
      },
    }, null, 2));
  } finally {
    await prisma.workEstimate.deleteMany({ where: { scopeId: scope.id } });
    await prisma.scope.delete({ where: { id: scope.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
