import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { chromium, webkit, type Page } from "playwright";
import { prisma } from "../lib/prisma";
import { assembleDecisionBrief } from "../lib/reports/decisionBrief";
import { buildBriefRecipe } from "../lib/reports/composer";
import { READER_COOKIE } from "../lib/reports/sharingPolicy";
import { healthyOwnerFixture } from "./lib/decision-brief-fixtures";
import { assertDisposableDatabaseProofEnvironment } from "./lib/disposable-db-proof-guard";

/** Real PDF/auth/DB path, fictional saved report, no live providers or email.
 * The mail preload rejects every non-loopback fetch except its mock sender.
 * Use only a fresh local DB and an already-built app, never staging data.
 */
async function main() {
  assertDisposableDatabaseProofEnvironment(process.env, "SIGNAL_REPAIR_DB_PROOF");
  assert.equal(await prisma.scope.count(), 0, "Start with an empty disposable project database");
  assert.equal(await prisma.report.count(), 0);
  const base = "http://127.0.0.1:4398";
  const reportOrigin = "https://signal.example";
  const password = randomUUID();
  const output = resolve(process.argv[2] ?? "../outputs/report-download-proof");
  mkdirSync(output, { recursive: true });
  try {
    await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(500) });
    throw new Error("Refusing to use occupied proof port 4398");
  } catch (error) {
    if (error instanceof Error && error.message.includes("occupied")) throw error;
  }

  let server: ChildProcess | null = null;
  const emails: { text: string; to: string[] }[] = [];
  const receipts: unknown[] = [];
  const scope = await prisma.scope.create({
    data: {
      name: "FICTIONAL QA — download acceptance",
      teamKey: "PH2",
      executionState: "not_configured",
    },
  });
  try {
    const owner = healthyOwnerFixture();
    owner.project = { ...owner.project, id: scope.id, name: scope.name };
    const brief = assembleDecisionBrief(owner);
    const report = await prisma.report.create({
      data: {
        scopeId: scope.id,
        mode: "reality",
        likelyDate: new Date("2026-11-01"),
        earliestDate: new Date("2026-10-20"),
        latestDate: new Date("2026-11-18"),
        shippedCount: 0,
        blockingCount: 0,
        resolvedSinceLastCount: 0,
        summaryMarkdown: "Fictional frozen download fixture.",
        briefSnapshot: JSON.parse(JSON.stringify(brief)),
        briefRecipe: JSON.parse(
          JSON.stringify(buildBriefRecipe("delivery-leadership", "weekly-update", brief)),
        ),
      },
    });
    const scopeBefore = await prisma.scope.findUniqueOrThrow({ where: { id: scope.id } });
    server = spawn(
      process.execPath,
      [
        "--require",
        "./scripts/lib/report-mail-mock.cjs",
        "./node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "4398",
      ],
      {
        env: {
          ...process.env,
          NODE_ENV: "production",
          NEXT_TELEMETRY_DISABLED: "1",
          APP_PASSWORD: password,
          OPERATOR_APP_ORIGIN: base,
          REPORT_PUBLIC_ORIGIN: reportOrigin,
          REPORT_SHARING_SECRET: randomUUID() + randomUUID(),
          REPORT_EMAIL_FROM: "reports@example.com",
          RESEND_API_KEY: "mock-only-key",
          KIT_DEV_FIXTURES: "1",
          LINEAR_API_KEY: "",
          ANTHROPIC_API_KEY: "",
          OPERATOR_LEGACY_SESSION_FROM: "",
          OPERATOR_LEGACY_SESSION_UNTIL: "",
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    // Drain logs but never persist cookies, codes or credentials in receipts.
    server.stdout!.resume();
    server.stderr!.resume();
    server.on("message", (raw: unknown) => {
      const message = raw as { type: string; body: { text: string; to: string[] } };
      if (message.type === "mock-report-mail") emails.push(message.body);
    });
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      assert.equal(server.exitCode, null, "Proof server must stay running");
      try {
        if ((await fetch(`${base}/api/version`)).ok) {
          ready = true;
          break;
        }
      } catch {
        /* Starting. */
      }
      await pause(250);
    }
    assert(ready, "Local proof server did not start");
    const ownerPdf = `/api/reports/${report.id}/pdf`;
    const management = `/api/reports/${report.id}/shares`;
    const request = (path: string, body: unknown, operator = false, method = "POST") =>
      fetch(base + path, {
        method,
        headers: {
          "content-type": "application/json",
          origin: operator ? base : reportOrigin,
          ...(operator ? { authorization: `Bearer ${password}` } : {}),
        },
        body: JSON.stringify(body),
      });

    for (const [engineName, engine] of [
      ["chromium", chromium],
      ["webkit", webkit],
    ] as const) {
      const browser = await engine.launch();
      const errors: string[] = [];
      try {
        const context = await browser.newContext({
          acceptDownloads: true,
          viewport: { width: 1200, height: 900 },
        });
        await context.route("**/*", (route) =>
          new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
        );
        assert.equal(
          (
            await context.request.post(base + "/api/login", {
              headers: { origin: base },
              data: { password },
            })
          ).status(),
          200,
        );
        // WebKit excludes Secure cookies on HTTP loopback; this adaptation is
        // confined to the disposable test jar, never the app's HTTPS cookies.
        if (engineName === "webkit")
          await context.addCookies(
            (await context.cookies()).map((cookie) => ({ ...cookie, secure: false })),
          );
        const page = await context.newPage();
        page.setDefaultTimeout(15_000);
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${base}/reports/${report.id}/share`);
        await page.getByRole("heading", { name: "Review, then share" }).waitFor();

        async function downloadFrom(target: Page, kind: "automatic" | "native", label: string) {
          const downloaded = target.waitForEvent("download");
          if (kind === "automatic")
            await target.getByRole("button", { name: "Download PDF", exact: true }).click();
          else {
            await target.getByRole("link", { name: "Use browser download", exact: true }).focus();
            await target.keyboard.press("Enter");
          }
          const file = await downloaded;
          assert.equal(await file.failure(), null);
          const path = resolve(output, `${engineName}-${label}.pdf`);
          await file.saveAs(path);
          const bytes = readFileSync(path);
          assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
          assert(bytes.length > 10_000);
          return { label, suggestedFilename: file.suggestedFilename(), bytes: bytes.length };
        }
        const downloads = [
          await downloadFrom(page, "automatic", "operator-auto"),
          await downloadFrom(page, "native", "operator-native"),
        ];
        await page.getByRole("status").filter({ hasText: "PDF prepared" }).waitFor();
        // A failed fetch must be explained inline, not downloaded as a .pdf.
        for (const failure of [
          {
            status: 401,
            contentType: "application/json",
            body: '{"error":"Sign in again before downloading."}',
            text: /Sign in again before downloading/,
          },
          {
            status: 200,
            contentType: "text/html",
            body: "<html>Sign in</html>",
            text: /did not return a PDF/,
          },
        ]) {
          await page.route(`**${ownerPdf}`, (route) => route.fulfill(failure));
          await page.getByRole("button", { name: "Download PDF", exact: true }).click();
          await page.getByRole("alert").filter({ hasText: failure.text }).waitFor();
          assert.equal(
            await page.getByRole("status").filter({ hasText: "PDF prepared" }).count(),
            0,
          );
          await page.unroute(`**${ownerPdf}`);
        }
        downloads.push(await downloadFrom(page, "automatic", "operator-retry"));
        await page.screenshot({ path: resolve(output, `${engineName}-operator.png`) });

        const published = await request(
          management,
          {
            emails: ["reader@example.com"],
            pair: false,
            days: 7,
            requestId: randomUUID(),
            reviewedPrivateContent: true,
          },
          true,
        );
        assert.equal(
          published.status,
          201,
          `Fictional share refused: ${published.status === 201 ? "" : await published.text()}`,
        );
        const share = (await published.json()).share;
        const access = `/api/report-access/${share.id}`;
        assert.equal((await fetch(base + access + "/pdf")).status, 401);
        const mailCount = emails.length;
        const challenge = await request(access + "/request", { email: "reader@example.com" });
        assert.equal(challenge.status, 202);
        for (let i = 0; i < 80 && emails.length === mailCount; i++) await pause(50);
        assert.equal(emails.length, mailCount + 1);
        assert.deepEqual(emails[mailCount].to, ["reader@example.com"]);
        const verified = await request(access + "/verify", {
          challengeId: (await challenge.json()).challengeId,
          code: emails[mailCount].text.match(/code is (\d{8})/)![1],
        });
        assert.equal(verified.status, 200);
        const reader = await browser.newContext({
          acceptDownloads: true,
          viewport: { width: 1024, height: 768 },
        });
        await reader.route("**/*", (route) =>
          new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
        );
        const token = verified.headers
          .get("set-cookie")!
          .split(";")[0]
          .slice(READER_COOKIE.length + 1);
        await reader.addCookies([
          {
            name: READER_COOKIE,
            value: token,
            url: base,
            httpOnly: true,
            sameSite: "Strict",
            secure: false,
          },
        ]);
        const readerPage = await reader.newPage();
        readerPage.setDefaultTimeout(15_000);
        readerPage.on("pageerror", (error) => errors.push(error.message));
        await readerPage.goto(base + share.path);
        await readerPage.getByRole("button", { name: "Sign out of report" }).waitFor();
        downloads.push(
          await downloadFrom(readerPage, "automatic", "reader-auto"),
          await downloadFrom(readerPage, "native", "reader-native"),
        );
        await readerPage.screenshot({ path: resolve(output, `${engineName}-reader.png`) });
        assert.equal(
          (await reader.request.get(base + ownerPdf)).status(),
          401,
          "Reader must not gain operator access",
        );
        const revoked = await request(
          management,
          { shareId: share.id, revision: share.revision, action: "revoke" },
          true,
          "PATCH",
        );
        assert.equal(revoked.status, 200);
        // Leave the old UI open to prove that a cached link does not retain access.
        assert.equal((await reader.request.get(base + access + "/pdf")).status(), 401);
        await readerPage.getByRole("button", { name: "Download PDF", exact: true }).click();
        await readerPage
          .getByRole("alert")
          .filter({ hasText: /Sign in/ })
          .waitFor();
        await readerPage.reload();
        assert.equal(
          await readerPage.getByRole("link", { name: "Use browser download" }).count(),
          0,
        );
        assert.doesNotMatch(
          await readerPage.locator("body").innerText(),
          /FICTIONAL QA — download acceptance/,
        );
        assert.deepEqual(errors, []);
        receipts.push({
          engine: engineName,
          downloads,
          passed: true,
          checks: [
            "Native keyboard and automatic PDF downloads",
            "Inline auth/MIME failure and retry",
            "Approved reader downloads without operator access",
            "Revoked stale UI cannot download",
            "No browser errors",
          ],
        });
      } finally {
        await browser.close();
      }
    }
    assert.deepEqual(await prisma.report.findUniqueOrThrow({ where: { id: report.id } }), report);
    assert.deepEqual(
      await prisma.scope.findUniqueOrThrow({ where: { id: scope.id } }),
      scopeBefore,
    );
    writeFileSync(
      resolve(output, "result.json"),
      JSON.stringify(
        {
          passed: true,
          boundary:
            "Local production build with real auth, PDF and PostgreSQL. Fictional saved report; mock email; no live provider or deployment acceptance. Reader login established through HTTP, not a real inbox.",
          results: receipts,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify(receipts));
  } finally {
    if (server && server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill("SIGTERM");
      await exited;
    }
    await prisma.reportShare.deleteMany({ where: { report: { scopeId: scope.id } } });
    await prisma.report.deleteMany({ where: { scopeId: scope.id } });
    await prisma.scope.delete({ where: { id: scope.id } });
  }
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
