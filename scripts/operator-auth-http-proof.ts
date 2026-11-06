import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import { chromium, webkit } from "playwright";
import { prisma } from "../lib/prisma";
import { bridgeTransportTokenFor, sessionTokenFor } from "../lib/auth";
import { operatorTokenHash } from "../lib/auth/operatorPolicy";
import { assertDisposableDatabaseProofEnvironment } from "./lib/disposable-db-proof-guard";
import { currentWorkFixture } from "./lib/provisional-fixture";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { buildBriefRecipe } from "../lib/reports/composer";

async function main() {
  assertDisposableDatabaseProofEnvironment(process.env, "SIGNAL_AUTH_DB_PROOF");
  assert.equal(await prisma.operatorSession.count(), 0, "Use a fresh auth table");
  assert.equal(await prisma.operatorLoginRateLimit.count(), 0, "Use a fresh rate-limit table");
  const base = "http://127.0.0.1:4397",
    password = "local-provisional-proof";
  let child: ChildProcess | null = null,
    output = "",
    sessionTableRenamed = false;
  const scope = await prisma.scope.create({
    data: { name: "Fictional auth browser sentinel", teamKey: "TEST" },
  });
  const owner = healthyOwnerFixture();
  owner.project.id = scope.id;
  owner.project.name = scope.name;
  const brief = assembleDecisionBrief(owner),
    recipe = buildBriefRecipe("delivery-leadership", "weekly-update", brief);
  const report = await prisma.report.create({
    data: {
      scopeId: scope.id,
      likelyDate: new Date("2026-12-01"),
      earliestDate: new Date("2026-11-20"),
      latestDate: new Date("2026-12-15"),
      shippedCount: 0,
      blockingCount: 0,
      resolvedSinceLastCount: 0,
      summaryMarkdown: "Fictional authentication sentinel.",
      briefSnapshot: JSON.parse(JSON.stringify(brief)),
      briefRecipe: JSON.parse(JSON.stringify(recipe)),
    },
  });
  const snapshot = async () =>
    JSON.stringify({
      scopes: await prisma.scope.findMany({ orderBy: { id: "asc" } }),
      reports: await prisma.report.findMany({ orderBy: { id: "asc" } }),
    });
  const before = await snapshot();
  async function stop() {
    if (child && child.exitCode === null) {
      const stopped = once(child, "exit");
      child.kill("SIGTERM");
      await stopped;
    }
    child = null;
  }
  async function start(grace = false) {
    child = spawn(
      process.execPath,
      ["./node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4397"],
      {
        env: {
          ...process.env,
          NODE_ENV: "production",
          APP_PASSWORD: password,
          OPERATOR_APP_ORIGIN: base,
          OPERATOR_SESSION_EPOCH: "1",
          OPERATOR_LEGACY_SESSION_FROM: grace ? new Date(Date.now() - 1000).toISOString() : "",
          OPERATOR_LEGACY_SESSION_UNTIL: grace ? new Date(Date.now() + 60_000).toISOString() : "",
          NEXT_TELEMETRY_DISABLED: "1",
          LINEAR_API_KEY: "",
          ANTHROPIC_API_KEY: "",
          NOTION_API_KEY: "",
          FIGMA_API_KEY: "",
          REPORT_SHARING_SECRET: "",
          REPORT_PUBLIC_ORIGIN: "",
          REPORT_EMAIL_FROM: "",
          RESEND_API_KEY: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout!.on("data", (data) => {
      output += data;
    });
    child.stderr!.on("data", (data) => {
      output += data;
    });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(`Local server exited: ${output.slice(-2000)}`);
      if (
        await fetch(`${base}/api/version`)
          .then((r) => r.ok)
          .catch(() => false)
      )
        return;
      await pause(100);
    }
    throw new Error("Local server did not start");
  }
  const get = (path: string, headers: HeadersInit = {}) =>
    fetch(base + path, { headers, redirect: "manual" });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, ...headers },
      body: JSON.stringify(body),
      redirect: "manual",
    });
  async function login() {
    const response = await post("/api/login", { password });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie")!;
    for (const flag of [/HttpOnly/i, /Secure/i, /SameSite=lax/i, /Max-Age=2592000/])
      assert.match(cookie, flag);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    return cookie.split(";")[0];
  }
  try {
    await start();
    assert.equal((await get("/api/scopes")).status, 401);
    assert.equal((await get("/control-room")).status, 307);
    assert.equal(
      (await post("/api/login", { password }, { origin: "https://evil.example" })).status,
      403,
    );
    assert.equal((await post("/api/login", { password: "incorrect" })).status, 401);
    const one = await login(),
      two = await login();
    assert.notEqual(one, two);
    assert.equal((await get("/api/scopes", { cookie: one })).status, 200);
    assert.equal(
      (await get(`/reports/${report.id}/share`, { cookie: one })).status,
      200,
      "Share page accepts new operator session",
    );
    assert.equal(
      (await get(`/api/reports/${report.id}/shares`, { cookie: one })).status,
      200,
      "Share API independently accepts new session",
    );
    assert.equal(
      (
        await post(
          "/api/people",
          { name: "Must not be written" },
          { cookie: one, origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    assert.equal(
      (await post("/api/people", { name: 123 }, { cookie: one })).status,
      400,
      "Same-origin request reaches runtime validation",
    );
    const bridge = await bridgeTransportTokenFor(password);
    assert.equal(
      (await get("/api/bridge/jobs/fictional", { authorization: `Bearer ${bridge}` })).status,
      409,
      "Scoped token reaches existing job-claim check",
    );
    assert.equal(
      (await get("/api/bridge/jobs/fictional", { authorization: `Bearer ${password}` })).status,
      401,
    );
    assert.equal((await get("/api/scopes", { authorization: `Bearer ${bridge}` })).status, 401);
    assert.equal((await get("/api/scopes", { authorization: `Bearer ${password}` })).status, 200);
    assert.equal(
      (await get("/api/scopes", { cookie: "signal_report_reader=fictional-reader" })).status,
      401,
    );
    assert.equal(
      (await get("/shared/reports/fictional")).status,
      200,
      "Recipient entry still bypasses operator login and authenticates separately",
    );
    await post("/api/logout", {}, { cookie: one });
    assert.equal((await get("/api/scopes", { cookie: one })).status, 401);
    assert.equal((await get("/api/scopes", { cookie: two })).status, 200);
    await prisma.operatorSession.update({
      where: { tokenHash: operatorTokenHash(two.split("=")[1]) },
      data: { expiresAt: new Date(0) },
    });
    assert.equal((await get("/api/scopes", { cookie: two })).status, 401);
    const live = await login();
    await prisma.$executeRaw`ALTER TABLE "OperatorSession" RENAME TO "OperatorSessionAuthProofOffline"`;
    sessionTableRenamed = true;
    for (const response of [
      await get("/api/scopes", { cookie: live }),
      await post("/api/login", { password }),
      await post("/api/logout", {}, { cookie: live }),
    ]) {
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("set-cookie"), null);
      assert(
        !(await response.text()).includes("OperatorSessionAuthProofOffline"),
        "Storage details stay server-side",
      );
    }
    await prisma.$executeRaw`ALTER TABLE "OperatorSessionAuthProofOffline" RENAME TO "OperatorSession"`;
    sessionTableRenamed = false;
    assert.equal(
      (await get("/api/scopes", { cookie: live })).status,
      200,
      "Transient outage does not destroy valid session",
    );
    for (const [name, engine] of [
      ["chromium", chromium],
      ["webkit", webkit],
    ] as const) {
      const browser = await engine.launch({ headless: true });
      try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
        // The real server issues Secure cookies (asserted above). WebKit does
        // not accept them on loopback HTTP. Adapt only this isolated transport,
        // before the UI navigates, instead of racing a second page navigation.
        if (name === "webkit")
          await context.route("**/api/login", async (route) => {
            const response = await route.fetch();
            const headers = response.headers();
            if (headers["set-cookie"])
              headers["set-cookie"] = headers["set-cookie"].replace(/;\s*secure\b/gi, "");
            await route.fulfill({ response, headers });
          });
        await context.route("**/api/instrument/project*", (route) =>
          route.fulfill({ json: currentWorkFixture() }),
        );
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${base}/login?next=${encodeURIComponent("/control-room")}`);
        await page.getByLabel("Password", { exact: true }).fill(password);
        const signedIn = page.waitForResponse(
          (response) =>
            response.url() === `${base}/api/login` && response.request().method() === "POST",
        );
        await page.getByRole("button", { name: "Enter", exact: true }).click();
        const response = await signedIn;
        assert.equal(response.status(), 200);
        await page.getByRole("button", { name: "Sign out of Signal", exact: true }).waitFor();
        const stored = (await context.cookies()).find((cookie) => cookie.name === "kit_session")!;
        assert(stored.httpOnly);
        await page.evaluate(() =>
          sessionStorage.setItem("signal-auth-proof-sentinel", "draft preserved"),
        );
        page.once("dialog", (dialog) => dialog.dismiss());
        await page.getByRole("button", { name: "Sign out of Signal", exact: true }).click();
        assert.equal(
          (await get("/api/scopes", { cookie: `kit_session=${stored.value}` })).status,
          200,
          "Cancel sign-out is non-mutating",
        );
        page.once("dialog", (dialog) => dialog.accept());
        await page.getByRole("button", { name: "Sign out of Signal", exact: true }).click();
        await page.waitForURL(`${base}/login`);
        assert.equal(
          await page.evaluate(() => sessionStorage.getItem("signal-auth-proof-sentinel")),
          "draft preserved",
        );
        assert.equal(
          (await get("/api/scopes", { cookie: `kit_session=${stored.value}` })).status,
          401,
        );
        assert.deepEqual(errors, []);
        console.log(
          `PASS ${name}: sign-in UI, protected page, cancel/sign-out UI, server revocation, tab storage preserved`,
        );
      } finally {
        await browser.close();
      }
    }
    const legacy = `kit_session=${await sessionTokenFor(password)}`;
    assert.equal((await get("/api/scopes", { cookie: legacy })).status, 401);
    await stop();
    await start(true);
    assert.equal(
      (await get("/api/scopes", { cookie: legacy })).status,
      200,
      "Explicit grace supports an existing cookie",
    );
    assert.match(
      await login(),
      /^kit_session=op1_/,
      "Even during grace, all new sessions are random",
    );
    await stop();
    await start();
    assert.equal(
      (await get("/api/scopes", { cookie: legacy })).status,
      401,
      "Removing grace does not leave a hidden bypass",
    );
    const limited = await Promise.all(
      Array.from({ length: 25 }, () => post("/api/login", { password: "incorrect" })),
    );
    assert(
      limited.some(
        (response) => response.status === 429 && Number(response.headers.get("retry-after")) > 0,
      ),
    );
    assert(limited.every((response) => [401, 429].includes(response.status)));
    assert.equal(
      (await get("/api/scopes", { cookie: live })).status,
      200,
      "Login throttling does not lock out an existing session",
    );
    assert.equal(await snapshot(), before, "Business records and frozen reports are unchanged");
    console.log(
      "PASS production-build HTTP auth: cookies, independent report-owner guard, bridge compatibility, expiry/logout replay, outage recovery, bounded legacy transition, business-data preservation",
    );
  } finally {
    await stop();
    if (sessionTableRenamed)
      await prisma.$executeRaw`ALTER TABLE "OperatorSessionAuthProofOffline" RENAME TO "OperatorSession"`;
    await prisma.operatorSession.deleteMany();
    await prisma.operatorLoginRateLimit.deleteMany();
    await prisma.report.delete({ where: { id: report.id } });
    await prisma.scope.delete({ where: { id: scope.id } });
  }
}
main().finally(() => prisma.$disconnect());
