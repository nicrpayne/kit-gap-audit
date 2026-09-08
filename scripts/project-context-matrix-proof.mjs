// PROJECT CONTEXT IS URL-OWNED — permanent browser matrix.
//
// Run against an isolated server whose database was prepared with
// project-context-matrix-fixture.ts and KIT_DEV_FIXTURES=1. This proof is
// entirely read-only: it changes URL/view state and never invokes a governed
// write, runs an Audit, or generates a Report.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3021";
const PASSWORD = process.env.APP_PASSWORD ?? "proof";
const OUT = process.env.PROJECT_CONTEXT_MATRIX_OUT ?? "artifacts/project-context-matrix-v1";
const EXPECTED_IDS = ["matrix-jsa", "matrix-platform", "matrix-itrack", "matrix-design"];
const ROUTES = [
  { path: "/control-room", label: "Control Room", kind: "portfolio-wide" },
  { path: "/audit", label: "Audit", kind: "audit" },
  { path: "/decisions", label: "Decisions", kind: "decisions" },
  { path: "/forecast", label: "Forecast", kind: "forecast" },
  { path: "/portfolio", label: "Portfolio", kind: "portfolio" },
  { path: "/scope", label: "Scope", kind: "scope" },
  { path: "/orbit", label: "Dependencies", kind: "orbit" },
  { path: "/timeline", label: "Timeline", kind: "portfolio-wide" },
  { path: "/reports", label: "Reports", kind: "reports" },
];

mkdirSync(`${OUT}/screenshots`, { recursive: true });
let failures = 0;
const rows = [];
function check(name, ok, detail = "") {
  rows.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const scopesResponse = await fetch(`${BASE}/api/scopes`, {
  headers: { Authorization: `Bearer ${PASSWORD}` },
});
if (!scopesResponse.ok) throw new Error(`Could not read fixture projects: ${scopesResponse.status}`);
const allScopes = (await scopesResponse.json()).scopes;
const projects = EXPECTED_IDS.map((id) => allScopes.find((scope) => scope.id === id)).filter(Boolean);
check("fixture exposes every permanent matrix project", projects.length === EXPECTED_IDS.length, projects.map((p) => p.id).join(","));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await context.addCookies([{
  name: "kit_session",
  value: createHash("sha256").update(`kit-gap-audit::${PASSWORD}`).digest("hex"),
  domain: "localhost",
  path: "/",
}]);
const page = await context.newPage();
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("404")) browserErrors.push(`console: ${message.text()}`);
});

const projectInUrl = () => new URL(page.url()).searchParams.get("project");

async function waitForResolvedProject(route, project) {
  await page.locator('[data-shoot="instrument-rail"]').waitFor({ timeout: 45_000 });
  switch (route.kind) {
    case "audit":
      await page.locator('select[aria-label="Project"]').waitFor({ timeout: 45_000 });
      await page.waitForFunction((id) => document.querySelector('select[aria-label="Project"]')?.value === id, project.id);
      break;
    case "decisions":
      await page.locator('[data-shoot="circuit-scope"]').waitFor({ timeout: 45_000 });
      await page.waitForFunction((id) => document.querySelector('[data-shoot="circuit-scope"]')?.value === id, project.id);
      break;
    case "forecast":
    case "scope":
      await page.locator(`[data-shoot="scope-${project.id}"][aria-pressed="true"]`).waitFor({ timeout: 45_000 });
      break;
    case "orbit":
      await page.locator(`[data-shoot="orbit-focus-${project.id}"]`).waitFor({ timeout: 45_000 });
      await page.waitForFunction((id) => {
        const button = document.querySelector(`[data-shoot="orbit-focus-${id}"]`);
        return button instanceof HTMLElement && button.style.background !== "transparent";
      }, project.id);
      break;
    case "portfolio":
      await page.locator(`aside[aria-label="${project.name} detail"]`).waitFor({ timeout: 45_000 });
      break;
    case "reports":
      await page.locator(`select option[value="${project.id}"]`).waitFor({ state: "attached", timeout: 45_000 });
      await page.waitForFunction((id) => {
        const option = document.querySelector(`select option[value="${id}"]`);
        return option instanceof HTMLOptionElement && option.parentElement?.value === id;
      }, project.id);
      break;
    default:
      await page.getByText(project.name, { exact: true }).first().waitFor({ timeout: 45_000 });
  }
}

async function assertContext(name, route, project, { selected = false } = {}) {
  await page.waitForURL((url) => url.pathname === route.path && url.searchParams.get("project") === project.id, { timeout: 45_000 });
  await waitForResolvedProject(route, project);
  const url = new URL(page.url());
  check(`${name} URL resolves ${project.name}`, url.searchParams.get("project") === project.id, url.toString());
  check(`${name} preserves explicit Scenario`, url.searchParams.get("scenario") === "matrix-scenario", url.search);
  if (selected) check(`${name} preserves selected canonical object`, url.searchParams.get("select") === `scope:${project.id}`, url.search);
}

// Direct links: every instrument must consume the exact project named by the
// URL, preserve explicit carried context, and never silently choose default.
for (const project of projects) {
  for (const route of ROUTES) {
    const query = new URLSearchParams({
      project: project.id,
      scenario: "matrix-scenario",
      select: `scope:${project.id}`,
    });
    await page.goto(`${BASE}${route.path}?${query}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await assertContext(`direct ${route.label}`, route, project, { selected: true });
  }
}

// Audit is the project switch authority under test. Exercise repeated
// switches, Back/Forward, a live Inspector, and a switch after Search/Trace.
await page.goto(`${BASE}/audit?project=${projects[0].id}&scenario=matrix-scenario&select=scope%3A${projects[0].id}`, {
  waitUntil: "domcontentloaded",
  timeout: 45_000,
});
await waitForResolvedProject(ROUTES[1], projects[0]);
const frame = page.frameLocator('iframe[title="Signal Audit World"]');
await frame.locator("#brain-canvas").waitFor({ timeout: 45_000 });
await frame.locator("#brain-canvas").evaluate((canvas) => { canvas.dataset.projectMatrixMount = "original"; });

const search = frame.locator("#brain-search");
await search.fill(projects[0].name.split(" ").at(-1));
const firstResult = frame.locator(".res").first();
await firstResult.waitFor({ timeout: 20_000 });
await firstResult.click({ force: true });
await frame.locator("#brain-card").waitFor({ timeout: 20_000 });
const trace = frame.locator('#brain-card [data-act="trace"]');
if (await trace.count()) await trace.click({ force: true });

for (const project of projects.slice(1)) {
  await page.locator('select[aria-label="Project"]').selectOption(project.id);
  await page.waitForURL((url) => url.pathname === "/audit" && url.searchParams.get("project") === project.id, { timeout: 45_000 });
  await waitForResolvedProject(ROUTES[1], project);
  const url = new URL(page.url());
  check(`Audit selector publishes ${project.name}`, projectInUrl() === project.id, url.toString());
  check(`Audit switch clears cross-project object selection`, !url.searchParams.has("select"), url.search);
  check(`Audit switch preserves explicit Scenario for ${project.name}`, url.searchParams.get("scenario") === "matrix-scenario", url.search);
  check(`Audit switch keeps Rubric mounted for ${project.name}`, await frame.locator("#brain-canvas").getAttribute("data-project-matrix-mount") === "original");
}

const beforeBack = projects.at(-2);
await page.goBack({ waitUntil: "domcontentloaded" });
await waitForResolvedProject(ROUTES[1], beforeBack);
check("Back restores the prior canonical project", projectInUrl() === beforeBack.id, page.url());
await page.goForward({ waitUntil: "domcontentloaded" });
await waitForResolvedProject(ROUTES[1], projects.at(-1));
check("Forward restores the next canonical project", projectInUrl() === projects.at(-1).id, page.url());
check("Back/Forward never remounts Rubric", await frame.locator("#brain-canvas").getAttribute("data-project-matrix-mount") === "original");

// Rail navigation: every destination receives the selected project from the
// canonical URL. Starting from Audit each time also proves the handoff that
// failed in the first production promotion.
for (const project of projects) {
  await page.goto(`${BASE}/audit?project=${project.id}&scenario=matrix-scenario`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await waitForResolvedProject(ROUTES[1], project);
  for (const route of ROUTES.filter((entry) => entry.path !== "/audit")) {
    const entry = page.locator(`[data-rail-entry="${route.label}"]`).first();
    if (!await entry.isVisible()) {
      // Scope and Dependencies live in Portfolio's expanded rack.
      const portfolio = page.locator('[data-rail-entry="Portfolio"]').first();
      if (await portfolio.isVisible()) {
        await portfolio.click();
        await page.waitForURL((url) => url.pathname === "/portfolio" && url.searchParams.get("project") === project.id, { timeout: 45_000 });
      }
    }
    await page.locator(`[data-rail-entry="${route.label}"]`).first().click();
    await assertContext(`rail ${route.label}`, route, project);
  }
}

await page.screenshot({ path: `${OUT}/screenshots/final-matrix.png`, animations: "disabled", fullPage: true });
check("matrix produced no browser errors", browserErrors.length === 0, browserErrors.join(" | "));

await browser.close();
const report = {
  fixture: "project-context-matrix-v1",
  baseUrl: BASE,
  projects: projects.map(({ id, name }) => ({ id, name })),
  routes: ROUTES,
  checks: rows.length,
  failures,
  browserErrors,
  results: rows,
};
writeFileSync(`${OUT}/matrix.json`, JSON.stringify(report, null, 2));
console.log(`\n${rows.length - failures}/${rows.length} checks passed`);
if (failures) process.exit(1);
