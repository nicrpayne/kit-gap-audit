import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import { prisma } from "../lib/prisma";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { buildBriefRecipe } from "../lib/reports/composer";
import { REQUEST_MESSAGE } from "../lib/reports/sharingPolicy";

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? "http://invalid");
  assert(process.env.SIGNAL_REPAIR_DB_PROOF === "1" && db.hostname === "127.0.0.1" && db.port === "55434" && db.pathname === "/signal_t0_test_1004", "Disposable repair DB only");
  const origin = "https://signal.example", local = "http://127.0.0.1:4277", password = randomUUID(), secret = randomUUID() + randomUUID();
  const mails: { body: { text: string; to: string[] }; key: string }[] = [];
  const rateKeys = (await prisma.reportShareRateLimit.findMany({ select: { key: true } })).map(r => r.key);
  const baseline = await prisma.report.findMany({ orderBy: { id: "asc" } });
  let child: ChildProcess | null = null, output = "";
  const scope = await prisma.scope.create({ data: { name: `CONFIDENTIAL HTTP proof ${randomUUID()}`, teamKey: "PRF", executionState: "not_configured" } });
  async function start(configured: boolean) {
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", APP_PASSWORD: password, REPORT_PUBLIC_ORIGIN: origin, REPORT_SHARING_SECRET: secret,
      REPORT_EMAIL_FROM: "reports@example.com", RESEND_API_KEY: configured ? "mock-only-key" : "", LINEAR_API_KEY: "", ANTHROPIC_API_KEY: "" };
    child = spawn(process.execPath, ["--require", "./scripts/lib/report-mail-mock.cjs", "./node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4277"], { env, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    child.stdout!.on("data", data => { output += data; }); child.stderr!.on("data", data => { output += data; });
    child.on("message", (raw: unknown) => { const item = raw as { type: string; body: { text: string; to: string[] }; key: string }; if (item.type === "mock-report-mail") mails.push(item); });
    for (let i = 0; i < 60; i++) {
      if (child.exitCode !== null) throw new Error(`Isolated server exited (${child.exitCode}).`);
      try { if ((await fetch(`${local}/api/version`)).ok) return; } catch { /* starting */ }
      await pause(250);
    }
    throw new Error("Isolated server did not start.");
  }
  async function stop() { if (child && child.exitCode === null) { const done = new Promise(resolve => child!.once("exit", resolve)); child.kill("SIGTERM"); await done; } child = null; }
  const get = (path: string, cookie?: string, extra: Record<string, string> = {}) => fetch(local + path, { headers: { ...(cookie ? { cookie } : {}), ...extra }, redirect: "manual" });
  const post = (path: string, body: unknown, owner = false, method = "POST", cookie?: string, from = origin) => fetch(local + path, { method, headers: { "content-type": "application/json", origin: from, ...(owner ? { authorization: `Bearer ${password}` } : {}), ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body), redirect: "manual" });
  async function generic(path: string, cookie?: string, extra: Record<string, string> = {}) {
    const response = await get(path, cookie, extra), html = await response.text();
    assert.equal(response.status, 200); assert(!html.includes(scope.name), "unauthorized HTML/RSC cannot contain project name");
    assert.match(response.headers.get("cache-control")!, /no-store/); assert.match(response.headers.get("x-robots-tag")!, /noindex/);
  }
  try {
    const owner = healthyOwnerFixture(); owner.project.id = scope.id; owner.project.name = scope.name;
    const brief = assembleDecisionBrief(owner), recipe = buildBriefRecipe("delivery-leadership", "weekly-update", brief);
    const report = await prisma.report.create({ data: { scopeId: scope.id, mode: "reality", likelyDate: new Date("2026-11-01"), earliestDate: new Date("2026-10-20"), latestDate: new Date("2026-11-18"), shippedCount: 0, blockingCount: 0, resolvedSinceLastCount: 0, summaryMarkdown: "Fictional HTTP proof", briefSnapshot: JSON.parse(JSON.stringify(brief)), briefRecipe: JSON.parse(JSON.stringify(recipe)) } });
    const management = `/api/reports/${report.id}/shares`;
    await start(true);
    assert.equal((await get(management)).status, 401);
    const payload = { emails: ["reader@example.com"], pair: false, days: 7, requestId: randomUUID(), reviewedPrivateContent: true };
    assert.equal((await post(management, { ...payload, reviewedPrivateContent: false }, true)).status, 400);
    const published = await post(management, payload, true); assert.equal(published.status, 201);
    let share = (await published.json()).share;
    const path = share.path, access = `/api/report-access/${share.id}`;
    await generic(path); await generic(path, undefined, { RSC: "1" }); await generic("/shared/reports/unknown");
    const wrong = await post(`${access}/request`, { email: "not-approved@example.com" });
    assert.equal(wrong.status, 202); const wrongBody = await wrong.json(); assert.equal(wrongBody.message, REQUEST_MESSAGE); assert.equal(mails.length, 0);
    const sent = await post(`${access}/request`, { email: "reader@example.com" });
    assert.equal(sent.status, 202); const challenge = await sent.json(); assert.equal(challenge.message, wrongBody.message); assert.deepEqual(Object.keys(challenge).sort(), Object.keys(wrongBody).sort());
    for (let i = 0; i < 40 && mails.length === 0; i++) await pause(50);
    assert.equal(mails.length, 1, "actual Next after callback delivered only to mock transport");
    const code = mails[0].body.text.match(/code is (\d{8})/)![1]; assert.deepEqual(mails[0].body.to, ["reader@example.com"]);
    assert(!mails[0].body.text.includes(scope.name));
    const creds = { challengeId: challenge.challengeId, code };
    assert.equal((await post(`${access}/verify`, creds, false, "POST", undefined, "https://evil.example")).status, 403);
    assert.equal((await post(`${access}/verify`, { ...creds, code: code === "00000000" ? "11111111" : "00000000" })).status, 401);
    const verified = await post(`${access}/verify`, creds); assert.equal(verified.status, 200);
    const setCookie = verified.headers.get("set-cookie")!; assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /Secure/i); assert.match(setCookie, /SameSite=strict/i);
    const cookie = setCookie.split(";")[0];
    const authorized = await get(path, cookie), html = await authorized.text(); assert.equal(authorized.status, 200); assert(html.includes(scope.name));
    assert(html.includes("Timeline snapshot") && html.includes("Evidence you can inspect")); assert(!html.includes('href="/scope'));
    assert.match(authorized.headers.get("cache-control")!, /no-store/);
    assert.equal((await post(`${access}/verify`, creds)).status, 401, "HTTP replay denied");
    assert.equal((await get(management, cookie)).status, 401);
    assert.equal((await get("/api/scopes", cookie)).status, 401);
    assert.equal((await get("/scope", cookie)).status, 307);
    assert.equal((await get(`/reports/${report.id}/share?pair=1`, cookie)).status, 307);
    await generic("/shared/reports/other", cookie);
    const updated = await post(management, { shareId: share.id, revision: share.revision, action: "recipients", emails: ["replacement@example.com"] }, true, "PATCH");
    assert.equal(updated.status, 200); share = (await updated.json()).share; await generic(path, cookie);
    const readded = await post(management, { shareId: share.id, revision: share.revision, action: "recipients", emails: ["reader@example.com"] }, true, "PATCH");
    assert.equal(readded.status, 200); share = (await readded.json()).share; await generic(path, cookie);
    const logout = await post(`${access}/logout`, {}, false, "POST", cookie); assert.equal(logout.status, 200); assert.match(logout.headers.get("set-cookie")!, /Max-Age=0|1970/);
    assert.deepEqual(await prisma.report.findUniqueOrThrow({ where: { id: report.id } }), report, "all access operations preserve saved report");
    await stop(); await start(false);
    const notReady = await get(management, undefined, { authorization: `Bearer ${password}` }); assert.equal((await notReady.json()).ready, false);
    assert.equal((await post(management, { ...payload, requestId: randomUUID() }, true)).status, 503);
    assert.equal((await post(`${access}/request`, { email: "reader@example.com" })).status, 503);
    await generic(path, cookie);
    assert.equal((await post(management, { shareId: share.id, revision: share.revision, action: "revoke" }, true, "PATCH")).status, 200, "owner can revoke even when mail config is absent");
    assert(!output.includes(secret) && !output.includes(code) && !output.includes("reader@example.com"), "server output contains no credentials, codes or recipient emails");
    console.log("PASS actual Next HTTP: generic anonymous HTML/RSC, approved-email mock delivery via after(), secure cookie, wrong origin/code/replay, read-only snapshot, no working-app access, removal/regrant, sign-out, config fail-closed and revocation without mail");
  } finally {
    await stop();
    await prisma.reportShare.deleteMany({ where: { report: { scopeId: scope.id } } });
    await prisma.report.deleteMany({ where: { scopeId: scope.id } }); await prisma.scope.delete({ where: { id: scope.id } });
    await prisma.reportShareRateLimit.deleteMany({ where: { key: { notIn: rateKeys } } });
    assert.deepEqual(await prisma.report.findMany({ orderBy: { id: "asc" } }), baseline);
    console.log("PASS isolated HTTP fixture cleanup; no real email or external service contacted. Not a browser or live-mail acceptance claim.");
  }
}
main().finally(() => prisma.$disconnect());
