import assert from "node:assert/strict";
import { sessionTokenFor } from "../lib/auth";
import { briefPayloadFingerprint } from "../lib/reports/decisionBriefRender";
import { isDecisionBriefV1 } from "../lib/reports/decisionBrief";

// Read-only HTTP acceptance; no browser JavaScript, live provider requests or
// report creation. Set the explicitly targeted origin/project and password.
async function main() {
  const origin = process.env.PRINT_PROOF_ORIGIN ?? "http://127.0.0.1:3018";
  const scopeId = process.env.PRINT_PROOF_SCOPE ?? "qa-mod11-scope";
  const password = process.env.APP_PASSWORD;
  assert(password, "an authenticated test environment is required");
  const cookie = `kit_session=${await sessionTokenFor(password)}`;
  const headers = { cookie };
  const get = (path: string, authenticated = true) => fetch(`${origin}${path}`, {
    headers: authenticated ? headers : {}, redirect: "manual", signal: AbortSignal.timeout(30_000),
  });
  const reportsResponse = await get(`/api/reports?scopeId=${encodeURIComponent(scopeId)}`);
  assert.equal(reportsResponse.status, 200);
  const { reports }: { reports?: Array<{ id: string; briefSnapshot: unknown }> } = await reportsResponse.json();
  assert(Array.isArray(reports) && reports.length, "retained reports required");
  const selected: string[] = process.env.PRINT_PROOF_IDS?.split(",") ?? reports.slice(0, 2).map((r) => r.id);
  for (const id of selected) {
    const report: { id: string; briefSnapshot: unknown } | undefined = reports.find((r) => r.id === id);
    assert(report, `saved report ${id} exists`);
    const path = `/reports/${encodeURIComponent(id)}/print`;
    const unauthenticated = await get(path, false);
    assert.equal(unauthenticated.status, 307, "private print retains authentication");
    assert.match(unauthenticated.headers.get("location") ?? "", /\/login\?/);
    const response = await get(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/);
    const html = await response.text();
    const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    assert.match(markup, /<article\b/, "report visible without executing scripts");
    assert.doesNotMatch(markup, /<[^>]*\bhidden(?:[\s=>])/, "no hidden report awaiting stream swap");
    assert.doesNotMatch(markup, /animate-pulse|id="[BS]:\d+"/, "no loading/Suspense shell");
    assert.match(markup, /Immutable snapshot only/);
    assert.match(markup, /rel="stylesheet"/);
    assert.match(markup, new RegExp(`/reports\\?project=${encodeURIComponent(scopeId)}`));
    if (isDecisionBriefV1(report.briefSnapshot)) {
      const fingerprint = briefPayloadFingerprint(report.briefSnapshot);
      assert(markup.includes(fingerprint), "initial markup matches frozen payload identity");
    }
    // Only the allowlisted saved snapshot is serialized, never the complete
    // database record or a newly read project/forecast owner.
    const serialized = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    assert(serialized, "buffered Pages document received");
    const data = JSON.parse(serialized);
    assert.deepEqual(Object.keys(data.props.pageProps.report).sort(), ["briefRecipe", "briefSnapshot", "scopeId", "summaryMarkdown"]);
    assert.deepEqual(data.props.pageProps.report.briefSnapshot, report.briefSnapshot);
    console.log(`PASS buffered print ${id}: visible initial HTML, exact frozen snapshot, authenticated/no-store`);
  }
  assert.equal((await get("/reports/print-proof-does-not-exist/print")).status, 404);
  console.log("PASS missing saved report returns 404; no data written");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
