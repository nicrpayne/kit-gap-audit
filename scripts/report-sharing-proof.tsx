import assert from "node:assert/strict";
import Module from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { buildBriefRecipe } from "../lib/reports/composer";
import { savedReportHandoff } from "../lib/reports/savedHandoff";
import { recipientSnapshot } from "../lib/reports/recipientSnapshot";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";
import { freezeCapabilityEstimate, freezeForecastBasis } from "../lib/reports/forecastBasis";
import { codeHash, emailAddress, recipientList, sharingSetup, newCode, newSession, equalSecret, shareIsActive, READER_COOKIE } from "../lib/reports/sharingPolicy";
import { requireOrigin, requireReportOwner, sharingBody, privateJson } from "../lib/reports/sharingHttp";
import { sessionTokenFor } from "../lib/auth";
import { middleware } from "../middleware";

async function main() {
  const runtime = Module as unknown as { _load(request: string, parent: unknown, isMain: boolean): unknown };
  const load = runtime._load;
  runtime._load = function(request, parent, isMain) { return request === "server-only" || request.endsWith(".module.css") ? {} : load.call(this, request, parent, isMain); };
  const { default: View } = await import("../components/reports/RecipientReportView");
  const { sendReportCode } = await import("../lib/reports/sharingMail");
  runtime._load = load;
  const env = { REPORT_SHARING_SECRET: "test-only-secret-longer-than-32-chars", REPORT_PUBLIC_ORIGIN: "https://signal.example", REPORT_EMAIL_FROM: "reports@example.com", RESEND_API_KEY: "test-only-key" };
  const config = sharingSetup(env).config!;
  assert(config);
  for (const key of Object.keys(env)) assert.equal(sharingSetup({ ...env, [key]: "" }).config, null);
  for (const origin of ["http://signal.example", "https://user:pass@signal.example", "https://signal.example/private", "https://signal.example?next=elsewhere"]) assert.equal(sharingSetup({ ...env, REPORT_PUBLIC_ORIGIN: origin }).config, null);
  assert.equal(emailAddress(" Leader+Report@Example.COM "), "leader+report@example.com");
  assert.deepEqual(recipientList(["a@example.com", "A@EXAMPLE.COM"]), ["a@example.com"]);
  for (const bad of ["a@example.com\r\nBCC:x@example.com", "not-email", null, "a..b@example.com"]) assert.throws(() => emailAddress(bad));
  assert.throws(() => recipientList([])); assert.throws(() => recipientList(Array(26).fill("a@example.com")));
  assert.match(newCode(), /^\d{8}$/); assert.match(newSession(), /^[\w-]{43}$/);
  assert.notEqual(codeHash(config.secret, "a", "12345678"), codeHash(config.secret, "b", "12345678"));
  assert(equalSecret("same", "same") && !equalSecret("same", "different"));
  assert(!shareIsActive({ expiresAt: new Date(0), revokedAt: null }, new Date()));

  const brief = assembleDecisionBrief(healthyOwnerFixture());
  brief.identity.project.value.name = 'Fictional <script>alert("x")</script>';
  brief.identity.sourceSnapshots[0].asOf = "not exposed by the system";
  const recipe = buildBriefRecipe("delivery-leadership", "weekly-update", brief);
  const bundle = savedReportHandoff([{ id: "report-one", mode: "reality", briefSnapshot: brief, briefRecipe: recipe }], "report-one", false);
  const projection = recipientSnapshot(bundle), before = JSON.stringify(projection);
  assert.equal(projection.reports[0].outcome.likely, brief.headline.likelyWindow.value.likely);
  assert.equal(projection.reports[0].targetFrequency, 78);
  assert.equal(projection.reports[0].asks.length, 0, "unconfirmed ask candidates do not become leadership asks");
  for (const forbidden of ["permittedReferences", "handoffPrompt", "briefSnapshot", "rawSamples", '"href"']) assert(!before.includes(forbidden), `projection excludes ${forbidden}`);
  const html = renderToStaticMarkup(<View snapshot={projection} />);
  assert(html.includes("&lt;script&gt;") && !html.includes("<script>"));
  assert(html.includes("not exposed by the system"));
  assert(html.includes("Timeline snapshot") && html.includes("not a measured real-world probability"));
  assert(!/href="(?:https?:|\/audit|\/scope|\/api)/.test(html));
  assert(html.includes("not been backfilled"));
  brief.headline.likelyWindow.value.likely = "2099-01-01";
  assert.equal(JSON.stringify(projection), before, "projection freezes values independently of source objects");
  const detailedOwner = healthyOwnerFixture();
  detailedOwner.forecast.basis = freezeForecastBasis([{ scopeId: "jsa", items: [], gates: [], teamCapacity: 1, dependsOnScopeIds: [], startDate: new Date("2026-10-08T21:42:29Z"), targetDate: null,
    capacityPhases: [{ startDay: 0, teamCapacity: 1 }, { startDay: 7, teamCapacity: 1.5 }] }], [freezeCapabilityEstimate("jsa", { id: "cap", name: "Evidence-only feature", revision: 1 }, {
    id: "estimate", contextSnapshotId: "original", capabilityId: "cap", rawEstimate: "2–8 days", range: { low: 2, likely: 5, high: 8 }, unit: "developer_days", basis: "remaining_capability",
    speaker: null, owner: null, observedAt: "2026-09-30", sourceRef: "meeting", excerpt: "Two to eight developer days remain.", evidenceRefs: ["exact-passage"], statement: "Remaining work", confidence: "explicit", acceptedAt: "2026-10-01", acceptedBy: "operator",
  }, [], "review_required", { status: "review_required", interpretation: "Review before using", reviewedBy: null, reviewedAt: null, coveredItemIds: ["TICKET-1"], additionalItemIds: ["TICKET-2"], usedInSimulation: false, reviewRequiredReason: "The ticket boundary changed." })]);
  const detailedBrief = assembleDecisionBrief(detailedOwner);
  const detailed = recipientSnapshot(savedReportHandoff([{ id: "detailed", mode: "reality", briefSnapshot: detailedBrief, briefRecipe: recipe }], "detailed", false));
  assert.equal(detailed.reports[0].forecastStart, "2026-10-08T21:42:29.000Z");
  assert.equal(detailed.reports[0].estimates[0].usedInSimulation, false);
  assert.deepEqual(detailed.reports[0].estimates[0].coveredItemIds, ["TICKET-1"]);
  assert.deepEqual(detailed.reports[0].estimates[0].additionalItemIds, ["TICKET-2"]);
  const detailedHtml = renderToStaticMarkup(<View snapshot={detailed} />);
  assert(detailedHtml.includes("Evidence only; ticket rollup used"));
  assert(detailedHtml.includes("Oct 15, 2026") && !detailedHtml.includes("Sep 11, 2026"), "phase dates use the frozen forecast start, never generation date");

  let deliveries = 0;
  await sendReportCode(config, { challengeId: "challenge", shareId: "share", email: "leader@example.com", code: "12345678" }, async (url, init) => {
    deliveries++; assert.equal(url, "https://api.resend.com/emails");
    const body = JSON.parse(String(init?.body)); assert.deepEqual(body.to, ["leader@example.com"]);
    assert(body.text.includes("12345678") && !body.text.includes(brief.identity.project.value.name));
    assert.equal(new Headers(init?.headers).get("Idempotency-Key"), "signal-report-challenge");
    return new Response("{}", { status: 200 });
  });
  assert.equal(deliveries, 1);
  await assert.rejects(sendReportCode(config, { challengeId: "x", shareId: "s", email: "x@example.com", code: "12345678" }, async () => new Response("provider detail", { status: 500 })), /Report email delivery failed/);

  const request = (headers: Record<string, string> = {}, body = "{}") => new NextRequest("https://signal.example/api/reports/one/shares", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
  assert.deepEqual(await sharingBody(request()), {});
  await assert.rejects(sharingBody(request({}, "[]")), /Invalid request/);
  await assert.rejects(sharingBody(request({}, "x".repeat(8193))), /too large/);
  assert.throws(() => requireOrigin(request({ origin: "https://evil.example" }), config.origin));
  assert.throws(() => requireOrigin(request({ origin: config.origin, "sec-fetch-site": "cross-site" }), config.origin));
  requireOrigin(request({ origin: config.origin }), config.origin);
  const prior = process.env.APP_PASSWORD;
  try {
    delete process.env.APP_PASSWORD;
    await assert.rejects(requireReportOwner(request()), /must be configured/);
    process.env.APP_PASSWORD = "fixture-operator-password";
    await assert.rejects(requireReportOwner(request({ cookie: `${READER_COOKIE}=${newSession()}` })), /Operator sign-in/);
    await requireReportOwner(request({ authorization: "Bearer fixture-operator-password" }), true);
    const cookie = `kit_session=${await sessionTokenFor(process.env.APP_PASSWORD)}`;
    await assert.rejects(requireReportOwner(request({ cookie }), true), /must come from Signal/);
    await requireReportOwner(request({ cookie, origin: config.origin }), true);
    for (const path of ["/api/reports/one/shares", "/api/scopes", "/api/report-access/one/admin"]) {
      const res = await middleware(new NextRequest(`${config.origin}${path}`, { headers: { cookie: `${READER_COOKIE}=${newSession()}` } }));
      assert.equal(res.status, 401, "recipient does not become an operator");
    }
    const publicPage = await middleware(new NextRequest(`${config.origin}/shared/reports/one`));
    assert.equal(publicPage.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    assert.match(publicPage.headers.get("cache-control")!, /no-store/);
    const returnLink = await middleware(new NextRequest(`${config.origin}/reports/one/share?pair=1`));
    assert.equal(new URL(returnLink.headers.get("location")!).searchParams.get("next"), "/reports/one/share?pair=1");
  } finally { if (prior === undefined) delete process.env.APP_PASSWORD; else process.env.APP_PASSWORD = prior; }
  assert.match(privateJson({ ok: true }).headers.get("cache-control")!, /no-store/);
  console.log("PASS report sharing policy, projection, inert rendering, mail contract, bounded bodies, origin checks, fail-closed owner auth and reader/operator separation (no real email sent)");
}
main();
