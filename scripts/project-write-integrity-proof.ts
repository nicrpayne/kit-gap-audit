/** Actual built routes + PostgreSQL. Refuses anything but an empty disposable local DB. */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { chromium, webkit, expect } from "playwright/test";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { normalizeSearchText } from "../lib/audit/searchText";
import type { ProjectBootstrapPackageV1 } from "../lib/bootstrap/contracts";
import { assertDisposableDatabaseProofEnvironment } from "./lib/disposable-db-proof-guard";

const base = "http://127.0.0.1:4398",
  password = "fictional-project-proof-only";
const execution = { state: "configured", teamKey: "JSA", projectNames: ["KIT JSA"] };
const outputDir = resolve(
  process.env.SIGNAL_PROJECT_PROOF_OUTPUT_DIR ?? "outputs/project-write-integrity",
);

async function seedBootstrap(name: string, aliases: string[] = [], invalidSource = false) {
  const row = await prisma.projectBootstrap.create({
    data: {
      canonicalName: name,
      normalizedName: normalizeSearchText(name),
      aliases,
      sourceHints: [],
      status: "reviewing",
      reviewRevision: 1,
    },
  });
  const pkg: ProjectBootstrapPackageV1 = {
    version: "1.1",
    packageId: `fixture:${row.id}`,
    bootstrapId: row.id,
    producer: "manual",
    compilerVersion: "project-write-proof",
    generatedAt: new Date().toISOString(),
    requestedIdentity: { canonicalName: name, aliases, sourceHints: [] },
    identity: { detectedCanonicalName: name, aliases, collisions: [], relatedEntities: [] },
    discovery: { strategies: [], partial: true },
    artifacts: [],
    evidence: [],
    intelligenceHeads: [],
    relations: [],
    proposals: [],
    coverage: [],
    ambiguities: [],
    gaps: [],
    warnings: ["Fictional concurrency test only."],
  };
  const scan = await prisma.bootstrapScanRun.create({
    data: {
      bootstrapId: row.id,
      sequence: 1,
      status: "complete",
      stage: "complete",
      providerCoverage: [],
      metrics: {},
      warnings: [],
    },
  });
  const packet = await prisma.bootstrapPackage.create({
    data: {
      bootstrapId: row.id,
      scanRunId: scan.id,
      packageId: pkg.packageId,
      packageVersion: pkg.version,
      producer: pkg.producer,
      compilerVersion: pkg.compilerVersion,
      packageHash: row.id,
      package: pkg as unknown as Prisma.InputJsonValue,
      generatedAt: new Date(pkg.generatedAt),
    },
  });
  await prisma.projectBootstrap.update({
    where: { id: row.id },
    data: { activePackageId: packet.id },
  });
  if (invalidSource)
    await prisma.bootstrapCandidate.create({
      data: {
        bootstrapId: row.id,
        packageId: packet.id,
        candidateKey: "invalid-source",
        kind: "source",
        title: "Fictional source missing its locator",
        summary: "Rollback probe",
        whyProposed: "Synthetic",
        matchBasis: "test",
        currentness: "current",
        relevance: "high",
        sourceFingerprint: "fixture",
        originalProposal: { payload: {} },
        status: "accepted",
        operatorAssertion: true,
      },
    });
  return row.id;
}

async function main() {
  assertDisposableDatabaseProofEnvironment(process.env, "SIGNAL_PROJECT_WRITE_PROOF");
  for (const count of await Promise.all([
    prisma.scope.count(),
    prisma.projectBootstrap.count(),
    prisma.report.count(),
    prisma.operatorSession.count(),
    prisma.operatorLoginRateLimit.count(),
    prisma.projectActivation.count(),
    prisma.finding.count(),
    prisma.auditRun.count(),
    prisma.contextSnapshot.count(),
  ])) {
    assert.equal(
      count,
      0,
      "Use an empty dedicated disposable database; proof cleanup owns its fixtures only",
    );
  }
  let child: ChildProcess | null = null,
    output = "",
    cookie = "";
  mkdirSync(outputDir, { recursive: true });
  // Never leave an older passing receipt behind if a rerun fails midway.
  writeFileSync(
    resolve(outputDir, "result.json"),
    JSON.stringify(
      { passed: false, status: "running", startedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  let receipt: Record<string, unknown> | undefined;
  const request = async (path: string, method = "GET", body?: unknown) =>
    fetch(base + path, {
      method,
      headers: { "content-type": "application/json", origin: base, cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "manual",
    });
  const create = (name: string, extra: Record<string, unknown> = {}) =>
    request("/api/scopes", "POST", {
      name,
      teamKey: execution.teamKey,
      projectNames: execution.projectNames,
      ...extra,
    });
  const patch = (id: string, body: unknown) => request(`/api/scopes/${id}`, "PATCH", body);
  const activate = (id: string) =>
    request(`/api/project-bootstraps/${id}/activate`, "POST", { expectedRevision: 1, execution });
  const expectStatuses = (responses: Response[], statuses: number[]) =>
    assert.deepEqual(responses.map((r) => r.status).sort(), statuses.sort());
  const newScope = async (name: string) => {
    const response = await create(name);
    assert.equal(response.status, 201, await response.clone().text());
    return (await response.json()).scope as { id: string; name: string };
  };

  try {
    child = spawn(
      process.execPath,
      ["./node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4398"],
      {
        env: {
          ...process.env,
          NODE_ENV: "production",
          KIT_DEV_FIXTURES: "1",
          APP_PASSWORD: password,
          OPERATOR_APP_ORIGIN: base,
          OPERATOR_SESSION_EPOCH: "project-proof",
          OPERATOR_LEGACY_SESSION_FROM: "",
          OPERATOR_LEGACY_SESSION_UNTIL: "",
          NEXT_TELEMETRY_DISABLED: "1",
          LINEAR_API_KEY: "",
          ANTHROPIC_API_KEY: "",
          NOTION_API_KEY: "",
          FIGMA_API_KEY: "",
          REPORT_EMAIL_FROM: "",
          RESEND_API_KEY: "",
          REPORT_SHARING_SECRET: "",
          REPORT_PUBLIC_ORIGIN: "",
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
    let ready = false;
    for (let n = 0; n < 100; n++) {
      if (child.exitCode !== null) throw new Error(`Local server exited: ${output.slice(-2000)}`);
      if (
        await fetch(`${base}/api/version`)
          .then((r) => r.ok)
          .catch(() => false)
      ) {
        ready = true;
        break;
      }
      await pause(100);
    }
    assert(ready, "Built server starts");
    const login = await request("/api/login", "POST", { password });
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie")!.split(";")[0];

    const sentinel = await newScope("Fictional existing report owner");
    const report = await prisma.report.create({
      data: {
        scopeId: sentinel.id,
        likelyDate: new Date("2026-12-01"),
        earliestDate: new Date("2026-11-20"),
        latestDate: new Date("2026-12-15"),
        shippedCount: 0,
        blockingCount: 0,
        resolvedSinceLastCount: 0,
        summaryMarkdown: "Fictional report that must remain unchanged.",
      },
    });
    const sentinelBefore = JSON.stringify(
      await prisma.scope.findUniqueOrThrow({ where: { id: sentinel.id } }),
    );

    for (let round = 0; round < 5; round++) {
      const name = `Fictional concurrent ${round}`;
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, n) => create(n % 2 ? ` ${name.toUpperCase()} ` : name)),
      );
      expectStatuses(results, [201, ...Array(9).fill(409)]);
      const rows = await prisma.scope.findMany({
        where: { name: { contains: `concurrent ${round}`, mode: "insensitive" } },
      });
      assert.equal(rows.length, 1, "One committed identity despite concurrent create requests");
    }
    const left = await newScope("Fictional rename left"),
      right = await newScope("Fictional rename right");
    expectStatuses(
      await Promise.all([
        patch(left.id, { name: "Fictional shared rename" }),
        patch(right.id, { name: " FICTIONAL SHARED RENAME " }),
      ]),
      [200, 409],
    );
    const createRename = await Promise.all([
      create("Fictional create rename race"),
      patch(right.id, { name: "Fictional create rename race" }),
    ]);
    assert.equal(createRename.filter((r) => r.status === 409).length, 1);
    assert.equal(
      createRename.filter((r) => r.ok).length,
      1,
      "Either create (201) or rename (200) may win",
    );
    console.log("PASS concurrent create and rename requests");

    const boot = await seedBootstrap("Fictional activation canonical", [
      "Fictional reserved alias",
    ]);
    const mixed = await Promise.all([activate(boot), create("Fictional reserved alias")]);
    expectStatuses(mixed, [201, 409]);
    const rows = await prisma.scope.findMany({
      where: { name: { in: ["Fictional activation canonical", "Fictional reserved alias"] } },
    });
    assert.equal(
      rows.length,
      1,
      "Activation aliases and ordinary creation share one identity boundary",
    );
    const bothA = await seedBootstrap("Fictional competing activation", ["Fictional shared alias"]);
    const bothB = await seedBootstrap("Fictional other activation", ["Fictional shared alias"]);
    expectStatuses(await Promise.all([activate(bothA), activate(bothB)]), [201, 409]);
    const single = await seedBootstrap("Fictional retried activation");
    const repeated = await Promise.all([activate(single), activate(single)]);
    expectStatuses(repeated, [200, 201]);
    const repeatedBodies = await Promise.all(repeated.map((r) => r.json()));
    assert.equal(repeatedBodies[0].scope.id, repeatedBodies[1].scope.id);
    assert.equal(repeatedBodies[0].snapshot.id, repeatedBodies[1].snapshot.id);
    assert.equal(repeatedBodies[0].audit.id, repeatedBodies[1].audit.id);
    const aliasOwner = await seedBootstrap("Fictional alias owner", ["Fictional already claimed"]);
    assert.equal((await activate(aliasOwner)).status, 201);
    assert.equal((await create("Fictional already claimed")).status, 409);
    assert.equal((await patch(left.id, { name: "Fictional already claimed" })).status, 409);
    assert.equal(
      (await create("Fictional_alias-owner")).status,
      409,
      "Name normalization agrees across creation and activation",
    );
    const rollbackName = "Fictional rejected activation";
    const rollback = await activate(await seedBootstrap(rollbackName, [], true));
    assert.equal(rollback.status, 400);
    assert.equal(
      await prisma.scope.count({ where: { name: rollbackName } }),
      0,
      "Failure after scope creation rolls back the whole activation",
    );
    console.log("PASS activation collisions, idempotent retries and rollback");

    const one = await newScope("Fictional dependency one"),
      two = await newScope("Fictional dependency two");
    expectStatuses(
      await Promise.all([
        patch(one.id, { dependsOnScopeIds: [two.id] }),
        patch(two.id, { dependsOnScopeIds: [one.id] }),
      ]),
      [200, 400],
    );
    const createdWithDependency = await create("Fictional atomic dependencies", {
      dependsOnScopeIds: [one.id],
    });
    assert.equal(createdWithDependency.status, 201);
    assert.deepEqual((await createdWithDependency.json()).scope.dependsOnScopeIds, [one.id]);
    assert.equal(
      (await create("Fictional missing dependency", { dependsOnScopeIds: ["missing"] })).status,
      400,
    );
    assert.equal(await prisma.scope.count({ where: { name: "Fictional missing dependency" } }), 0);
    console.log("PASS concurrent cycle prevention and atomic dependency creation");

    const settings = await newScope("Fictional settings round trip");
    const updated = await patch(settings.id, {
      targetDate: "2028-02-29",
      teamCapacity: 2.5,
      includeTriage: true,
      estimationContext: "Fictional remaining work",
      notionPageUrls: ["11111111222233334444555555555555"],
      figmaUrls: ["https://www.figma.com/design/Fictional1/Example?node-id=1-2"],
    });
    assert.equal(updated.status, 200);
    const settingsRow = await prisma.scope.findUniqueOrThrow({ where: { id: settings.id } });
    assert.equal(settingsRow.targetDate?.toISOString(), "2028-02-29T00:00:00.000Z");
    assert.equal(settingsRow.teamCapacity, 2.5);
    assert.equal(settingsRow.includeTriage, true);
    assert.equal(settingsRow.estimationContext, "Fictional remaining work");
    assert.deepEqual(settingsRow.notionPageIds, ["11111111-2222-3333-4444-555555555555"]);
    assert.deepEqual(settingsRow.figmaRefs, ["Fictional1:1:2"]);
    assert.equal(
      (
        await patch(settings.id, {
          targetDate: null,
          teamCapacity: 0,
          estimationContext: null,
          notionPageUrls: [],
          figmaUrls: [],
        })
      ).status,
      200,
    );
    const cleared = await prisma.scope.findUniqueOrThrow({ where: { id: settings.id } });
    assert.equal(cleared.targetDate, null);
    assert.equal(cleared.teamCapacity, null);
    assert.equal(cleared.estimationContext, null);
    assert.deepEqual(cleared.notionPageIds, []);
    assert.deepEqual(cleared.figmaRefs, []);

    for (const body of [
      { name: 123 },
      { dependsOnScopeIds: [null] },
      { targetDate: "2026-02-30" },
      { includeTriage: "false" },
      { teamCapacity: -2 },
    ]) {
      assert.equal((await patch(sentinel.id, body)).status, 400);
    }
    assert.equal((await patch(sentinel.id, { estimationContext: "x".repeat(70_000) })).status, 413);
    assert.equal(
      (
        await request(`/api/project-bootstraps/${single}/activate`, "POST", {
          expectedRevision: 1,
          acknowledgeProviderGaps: "false",
        })
      ).status,
      400,
    );
    assert.equal((await patch("missing", { name: "Fictional missing" })).status, 404);
    assert.equal(
      (await patch(one.id, { teamKey: "ITR", projectNames: ["KIT iTrack"] })).status,
      428,
    );
    assert.equal(
      (
        await patch(one.id, {
          teamKey: "ITR",
          projectNames: ["KIT iTrack"],
          expectedRealityRevision: 999,
        })
      ).status,
      409,
    );
    const historical = await prisma.scope.create({
      data: { name: "Fictional historical duplicate", teamKey: "JSA", projectNames: ["KIT JSA"] },
    });
    await prisma.scope.create({
      data: { name: "FICTIONAL HISTORICAL DUPLICATE", teamKey: "JSA", projectNames: ["KIT JSA"] },
    });
    assert.equal(
      (await patch(historical.id, { includeTriage: true })).status,
      200,
      "Unrelated settings do not rewrite historical duplicates",
    );
    assert.equal((await create("Fictional historical duplicate")).status, 409);
    const historyRows = await prisma.scope.findMany({
      where: { name: { equals: historical.name, mode: "insensitive" } },
    });
    assert.equal(historyRows.length, 2);
    console.log("PASS bounded HTTP validation, revisions and preservation of historical data");

    for (const engine of [chromium, webkit]) {
      const browser = await engine.launch({ headless: true });
      try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        // This proof targets project forms, not TLS. Real login is above; auth
        // cookie is attached without Secure only to this loopback browser context.
        await context.addCookies([
          {
            name: "kit_session",
            value: cookie.slice("kit_session=".length),
            url: base,
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        const page = await context.newPage(),
          errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(`${base}/scopes`);
        const form = page
          .locator("form")
          .filter({ has: page.getByRole("heading", { name: "Add scope", exact: true }) });
        const name = `Fictional ${engine.name()} browser`;
        await form.getByPlaceholder("iTrack", { exact: true }).fill(name);
        await form.getByRole("combobox").selectOption("JSA");
        await form.getByRole("checkbox", { name: "KIT JSA", exact: true }).check();
        let saved = page.waitForResponse(
          (r) => r.url() === `${base}/api/scopes` && r.request().method() === "POST",
        );
        await form.getByRole("button", { name: "Add scope", exact: true }).click();
        assert.equal((await saved).status(), 201);
        await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
        await form.getByPlaceholder("iTrack", { exact: true }).fill(name.toUpperCase());
        await form.getByRole("combobox").selectOption("JSA");
        await form.getByRole("checkbox", { name: "KIT JSA", exact: true }).check();
        saved = page.waitForResponse(
          (r) => r.url() === `${base}/api/scopes` && r.request().method() === "POST",
        );
        await form.getByRole("button", { name: "Add scope", exact: true }).click();
        assert.equal((await saved).status(), 409);
        await expect(form.getByText(/already exists/)).toBeVisible();
        await form.screenshot({
          path: resolve(outputDir, `${engine.name()}-duplicate-refusal.png`),
        });
        assert.equal(
          await form.getByPlaceholder("iTrack", { exact: true }).inputValue(),
          name.toUpperCase(),
          "Error preserves entered draft",
        );
        const row = page.getByRole("row").filter({ hasText: name });
        await row.getByRole("button", { name: "Edit", exact: true }).click();
        const edit = page
          .getByRole("row")
          .filter({ has: page.getByRole("button", { name: "Save", exact: true }) });
        await edit.getByPlaceholder("iTrack", { exact: true }).fill(`${name} renamed`);
        const edited = page.waitForResponse(
          (r) => r.url().includes("/api/scopes/") && r.request().method() === "PATCH",
        );
        await edit.getByRole("button", { name: "Save", exact: true }).click();
        assert.equal((await edited).status(), 200);
        await page.reload();
        await expect(page.getByRole("row").filter({ hasText: `${name} renamed` })).toBeVisible();
        assert.deepEqual(errors, []);
        await context.close();
        console.log(
          `PASS ${engine.name()}: create, duplicate refusal with draft retained, rename, persisted reload, no page errors`,
        );
      } finally {
        await browser.close();
      }
    }
    assert.equal(
      JSON.stringify(await prisma.scope.findUniqueOrThrow({ where: { id: sentinel.id } })),
      sentinelBefore,
    );
    assert.deepEqual(await prisma.report.findUniqueOrThrow({ where: { id: report.id } }), report);
    console.log(
      "PASS existing project and frozen report unchanged; no live provider or production access",
    );
    receipt = {
      passed: true,
      testedAt: new Date().toISOString(),
      node: process.version,
      browsers: ["chromium", "webkit"],
      concurrentCreateRequests: 50,
      checks: [
        "create/rename/activation collisions",
        "aliases and normalized names",
        "activation replay and atomic rollback",
        "dependency cycle race",
        "atomic project and dependency creation",
        "settings round trip and clearing",
        "HTTP validation and revisions",
        "historical duplicates preserved",
        "browser error recovery and persisted reload",
        "frozen report and existing project unchanged",
      ],
      productionAccess: false,
      externalProviderCalls: false,
    };
  } finally {
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    // The startup guard required these owner tables to be empty. Every row
    // below belongs to this invocation, in this explicitly disposable database.
    await prisma.projectActivation.deleteMany();
    await prisma.finding.deleteMany();
    await prisma.auditRun.deleteMany();
    await prisma.contextSnapshot.deleteMany();
    await prisma.report.deleteMany();
    await prisma.scope.deleteMany();
    await prisma.projectBootstrap.deleteMany();
    await prisma.operatorSession.deleteMany();
    await prisma.operatorLoginRateLimit.deleteMany();
    await prisma.$disconnect();
  }
  writeFileSync(
    resolve(outputDir, "result.json"),
    JSON.stringify({ ...receipt, cleanupComplete: true }, null, 2),
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
