import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateRunReceipt } from "../lib/estimate/status";

const complete = estimateRunReceipt({ total: 10, estimated: 4, cached: 6, failed: 0 });
assert.equal(complete.status, "complete");
assert.equal(complete.complete, true);
assert.match(complete.detail, /4 items updated/);

const partial = estimateRunReceipt({ total: 10, estimated: 3, cached: 5, failed: 2 });
assert.equal(partial.status, "partial");
assert.equal(partial.complete, false);
assert.match(partial.detail, /2 items failed/);
assert.match(partial.detail, /not invalidated/);

const failed = estimateRunReceipt({ total: 10, estimated: 0, cached: 0, failed: 10 });
assert.equal(failed.status, "failed");
assert.equal(failed.complete, false);
assert.match(failed.detail, /all 10 items/);
assert.match(failed.detail, /accepted reviewed capability estimates were not invalidated/);

const cachedWithFailedUpdates = estimateRunReceipt({ total: 10, estimated: 0, cached: 7, failed: 3 });
assert.equal(cachedWithFailedUpdates.status, "partial", "usable cached estimates make this a partial, not wholly failed, stage");

const empty = estimateRunReceipt({ total: 0, estimated: 0, cached: 0, failed: 0 });
assert.equal(empty.status, "complete");
assert.match(empty.detail, /no open work items/);

const refreshRoute = readFileSync("app/api/refresh/route.ts", "utf8");
assert.match(refreshRoute, /ok: estimateReceipt\.complete/);
assert.match(refreshRoute, /status: estimateReceipt\.complete \? "complete" : "partial"/);
assert.match(refreshRoute, /forecast: \{/,
  "an incomplete estimation stage must still return the independently computed forecast");
assert(!/if \(!estimateReceipt\.complete\)[\s\S]{0,160}return/.test(refreshRoute),
  "estimator failure must not blanket-block forecast computation");

const estimateRoute = readFileSync("app/api/estimate/route.ts", "utf8");
assert.match(estimateRoute, /ok: receipt\.complete/,
  "the alternate estimator endpoint must not silently label partial/all-failed runs successful");

const forecastView = readFileSync("components/ForecastView.tsx", "utf8");
assert.match(forecastView, /setEstimateStatus\(body\.detail\)/);
assert.match(forecastView, /aria-live="polite"/);
assert.match(forecastView, /data-estimation-status=\{estimateOutcome/);
assert(!/`Estimated \$\{body\.estimated\}/.test(forecastView),
  "the UI must not lead with a success claim when the stage failed");

console.log(JSON.stringify({
  ok: true,
  cases: {
    complete: complete.status,
    partial: partial.status,
    allFailed: failed.status,
    cachedWithFailedUpdates: cachedWithFailedUpdates.status,
    empty: empty.status,
  },
}, null, 2));
