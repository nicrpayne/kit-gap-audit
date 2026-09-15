import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Locator, type Page } from "playwright";

const baseURL = process.env.SIGNAL_PROOF_URL ?? "http://localhost:3311";
const repoOut = resolve("artifacts/scope-v2-browser-proof");
const deliverableOut = process.env.SIGNAL_SCOPE_V2_OUTPUT_DIR ?? repoOut;
mkdirSync(repoOut, { recursive: true });
mkdirSync(deliverableOut, { recursive: true });

const workIds = ["SOF-912", "SOF-913", "SOF-914", "SOF-915", "SOF-916", "SOF-748", "SOF-917", "SOF-918", "SOF-919", "SOF-920", "SOF-921", "SOF-922", "SOF-923", "SOF-924", "SOF-925", "SOF-926", "SOF-927", "SOF-907", "SOF-908", "SOF-909", "SOF-910", "SOF-911"];
const work = (id: string, index: number) => ({
  id, label: `${id} ${index % 2 ? "Implementation detail" : "Acceptance path"}`, low: 1, likely: 2, high: 4,
  estimateSource: "points", kind: "ticket", state: "Todo", externalUrl: `https://linear.example/${id}`, updatedAt: "2026-09-15T18:30:00.000Z",
  assignee: "JSA Team", points: 2, quote: null, rationale: null, parentIdentifier: null, parentTitle: null, projectName: "Job Safety Analysis",
});
const linked = [work("SOF-100", 0), work("SOF-101", 1)];
const executionItems = [...linked, ...workIds.map(work)];
const cap = (id: string, name: string, status: string, externalIds: string[] = []) => ({
  id, name, description: `${name} product outcome`, status, revision: 3, sortOrder: 0, updatedAt: "2026-09-15T18:00:00.000Z", workLinkCount: externalIds.length,
  provenance: { authority: "Scope", source: "operator", assertion: "Accepted product-shape truth", evidence: [{ ref: "context:jsa" }] },
  events: [{ id: `event-${id}`, action: "accept_scope", actor: "operator", createdAt: "2026-09-14T18:00:00.000Z" }],
  workLinks: externalIds.map((externalId) => ({ id: `link-${id}-${externalId}`, provider: "linear", externalId, externalUrl: `https://linear.example/${externalId}`, state: "active" })),
});
const capabilities = [
  cap("crew", "Crew acknowledgment", "accepted", linked.map((item) => item.id)),
  cap("guidance", "Arc-Angel JSA guidance", "accepted"),
  cap("photo", "Photo upload", "accepted"),
  cap("notifications", "Notifications", "future"),
  cap("pdf", "PDF / Docufy output", "future"),
  cap("offline", "Offline support", "future"),
  cap("approvals", "Submission and Job-Lead Approvals", "future"),
];
const coverage = {
  state: "modeled_subset", canonicalForecast: false, label: "Execution coverage unresolved", reason: "22 current execution items are not mapped to accepted product shape.",
  reasons: [{ code: "unmapped_execution", message: "22 current execution items are unmapped." }],
  census: { executionIssueCount: 24, modeledExecutionIssueCount: 2, acceptedCapabilityCount: 3, mappedAcceptedCapabilityCount: 1, unmappedExecutionIssueCount: 22, openShapeDecisionCount: 0 },
};
const payload = {
  startDate: "2026-09-15T00:00:00.000Z", forecastSource: { asOf: "2026-09-15T18:30:00.000Z", provider: "Linear", temporalRole: "live", availability: "available" },
  scopes: [{
    scopeId: "visual-jsa", name: "JSA", targetDate: "2026-10-31T00:00:00.000Z", dependsOnScopeIds: [], items: linked, executionItems, completedWork: [], gates: [], teamCapacity: 1,
    capacitySource: "inferred", explicitTeamCapacity: null, lastReport: null, reportHistory: [], capacityBasis: { kind: "inferred", assignees: ["JSA Team"], remainingIssueCount: 24, unassignedCount: 0 },
    capacityContract: { scopeId: "visual-jsa", workforceFte: 3, namedRawFte: 0, namedEffectiveFte: 0, forecastEffectiveFte: 1, source: "inferred", status: "legacy_inferred_unstaffed", reconciles: false },
    forecastSource: { asOf: "2026-09-15T18:30:00.000Z", provider: "Linear", temporalRole: "live", availability: "available" }, executionSource: { asOf: "2026-09-15T18:30:00.000Z", provider: "Linear", temporalRole: "live", availability: "available" },
    forecastCoverage: coverage, forecastReadiness: { state: "modeled_subset", reason: coverage.reason }, executionState: "configured", executionDetail: null,
    realityState: { realityRevision: 17, computedRevision: 17, status: "current", readiness: { ready: false, blockers: ["Named capacity is unreconciled."] } }, capabilities, openShapeQuestions: [],
  }],
  people: [], allocations: [], contextSwitchCostPct: 10, sources: [], findings: [], reports: [],
};
const clusters = [
  ["proposal-notifications", "Notifications", "notifications", workIds.slice(0, 5), "SOF-904"],
  ["proposal-offline", "Offline support", "offline", workIds.slice(9, 17), "SOF-857"],
  ["proposal-pdf", "PDF / Docufy output", "pdf", workIds.slice(5, 9), "SOF-747"],
  ["proposal-approvals", "Submission and Job-Lead Approvals", "approvals", workIds.slice(17), "SOF-903"],
] as const;
const proposal = {
  id: "proposal-jsa", scopeId: "visual-jsa", status: "active", generatedAt: "2026-09-15T19:00:00.000Z", stale: false,
  sourceWatermark: { linearAsOf: "2026-09-15T18:30:00.000Z", linearIssueCount: 26, contextSnapshotId: "snapshot-jsa", contextGeneratedAt: "2026-09-15T18:40:00.000Z", contextAcceptedAt: "2026-09-15T18:45:00.000Z", contextProducer: "Hermes", completeness: { status: "complete" } },
  summary: { likelyIn: 4, likelyOut: 0, boundaryReview: 0, confidentlyMatched: 4, suggested: 4, unresolved: 0 },
  items: clusters.map(([id, title, targetCapabilityId, ids, parent]) => ({
    id, title, description: `${title} release capability`, releaseSignal: "likely_in", confidence: "high", confidenceScore: 92, matchState: "confidently_matched", action: "link_existing", targetCapabilityId, targetRevision: 3,
    workItemIds: [...ids], alreadyLinkedItemIds: [], rationale: { headline: `Propose ${ids.length} missing work links to ${title}.`, signals: [`${ids.length} executable items follow Linear parent ${parent}.`, "Structured context corroborates this cluster."], cautions: [] },
    provenance: { linearParent: { identifier: parent, title }, linearItems: ids.map((identifier) => ({ identifier, state: "Todo", projectName: "JSA", updatedAt: "2026-09-15T18:30:00.000Z" })), contextSnapshotId: "snapshot-jsa", contextRefs: [{ kind: "release_requirement", id: `claim-${parent}`, statement: `${title} is in beta scope`, evidenceRefs: [`linear:${parent}`] }], method: "scope-proposal-deterministic-1.0" }, status: "suggested",
  })),
};

async function drag(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox(); const to = await target.boundingBox();
  assert.ok(from && to);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 18 }); await page.mouse.up();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1728, height: 1117 }, colorScheme: "dark" });
  const page = await context.newPage();
  await page.route("**/api/instrument/project", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }));
  await page.route("**/api/scopes/visual-jsa/proposal", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ proposal, stale: false }) }));
  await page.goto(`${baseURL}/scope?project=visual-jsa`);
  await page.locator('[data-shoot="reconciliation-workspace"]').waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(deliverableOut, "scope-v2-1728x1117.png") });

  assert.equal(await page.getByText("Forecast not ready", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Forecast not ready", { exact: true }).isVisible(), true);
  assert.equal(await page.getByText("Floor", { exact: true }).count(), 0, "noncanonical floor must not render");
  assert.equal(await page.locator('[data-shoot="unmapped-execution-tray"]').count(), 0, "raw horizontal ticket tray is removed");
  assert.equal(await page.locator('[data-shoot="proposal-card"]').count(), 4);

  await page.locator('[data-shoot="governed-outside-capability"]', { hasText: "Notifications" }).click();
  await page.getByRole("dialog", { name: "Scope Reality" }).waitFor();
  assert.equal(await page.getByRole("dialog", { name: "Scope Reality" }).locator("input").first().inputValue(), "Notifications");
  await page.getByRole("dialog", { name: "Scope Reality" }).getByRole("button", { name: "Close" }).click();

  await drag(page, page.locator('[data-shoot="governed-outside-capability"]', { hasText: "PDF / Docufy output" }), page.locator('[data-shoot="capability"]', { hasText: "Crew acknowledgment" }));
  await page.locator('[data-shoot="scope-impact-preview"]').waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(deliverableOut, "scope-v2-nested-drop-preview.png") });
  await page.getByRole("button", { name: "Keep hypothetical" }).click();

  await page.locator('[data-proposal-item="proposal-notifications"]').getByRole("button", { name: "Stage proposal" }).click();
  await page.getByText("Notifications", { exact: true }).first().click();
  await page.locator('[data-shoot="feature-detail"]').waitFor();
  assert.equal(await page.locator('[data-capability="capability:notifications"][data-selected="true"]').count(), 1, "selected module keeps a strong persistent state");
  await page.locator('[data-shoot="feature-detail"]').getByRole("button", { name: "Close" }).click().catch(() => page.keyboard.press("Escape"));
  await page.screenshot({ path: resolve(deliverableOut, "scope-v2-staged-proposal-1728x1117.png") });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: resolve(deliverableOut, "scope-v2-1440x900.png") });
  const overflow = await page.evaluate(() => ({ body: document.body.scrollWidth - innerWidth, root: document.documentElement.scrollWidth - innerWidth }));
  assert.ok(overflow.body <= 1 && overflow.root <= 1, `page should not overflow horizontally: ${JSON.stringify(overflow)}`);

  const result = { ok: true, proposalCards: 4, governedOutsideClickable: true, nestedChildDropOpenedPreview: true, selectedStatePersistent: true, truthBoundary: "forecast-not-ready/no-floor", horizontalOverflow: overflow };
  writeFileSync(resolve(repoOut, "browser-proof.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

main();
