import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, webkit, type BrowserContext, type Page } from "playwright";

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
  census: { executionIssueCount: 24, modeledExecutionIssueCount: 2, outsideExecutionIssueCount: 0, acceptedCapabilityCount: 3, mappedAcceptedCapabilityCount: 1, unmappedExecutionIssueCount: 22, openShapeDecisionCount: 0 },
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
  sourceWatermark: { linearAsOf: "2026-09-15T18:30:00.000Z", linearIssueCount: 26, linearClusterCount: 4, contextSnapshotId: "snapshot-jsa", contextGeneratedAt: "2026-09-15T18:40:00.000Z", contextAcceptedAt: "2026-09-15T18:45:00.000Z", contextProducer: "Hermes", contextRefCount: 12, realityCapabilityCount: 7, activeRelease: { name: "KIT JSA v1", normalizedName: "kit jsa v1", aliases: ["kit jsa v1", "v1"], source: "governed_scope_project", candidates: ["KIT JSA v1"] }, completeness: { status: "complete" } },
  summary: { likelyIn: 4, likelyOut: 0, boundaryReview: 0, confidentlyMatched: 4, suggested: 4, unresolved: 0, aligned: 4, noExecution: 2, executionExceptions: 1, conflicts: 0 },
  items: clusters.map(([id, title, targetCapabilityId, ids, parent]) => ({
    id, title, description: `${title} release capability`, origins: ["knowledge", "reality", "linear"], reconciliationState: "aligned", conflicts: [], releaseSignal: "likely_in", confidence: "high", confidenceScore: 92, matchState: "confidently_matched", action: "link_existing", targetCapabilityId, targetRevision: 3,
    workItemIds: [...ids], alreadyLinkedItemIds: [], rationale: { headline: `Propose ${ids.length} missing work links to ${title}.`, signals: [`${ids.length} executable items follow Linear parent ${parent}.`, "Structured context corroborates this cluster."], cautions: [] },
    provenance: { linearParent: { identifier: parent, title }, linearParents: [{ identifier: parent, title }], linearItems: ids.map((identifier) => ({ identifier, title: identifier === "SOF-912" ? "Maps nearest emergency room" : undefined, state: "Todo", projectName: "KIT JSA v1", updatedAt: "2026-09-15T18:30:00.000Z" })), contextSnapshotId: "snapshot-jsa", contextRefs: [{ kind: "release_requirement", id: `claim-${parent}`, statement: `${title} is confirmed in scope for KIT JSA V1`, evidenceRefs: [`linear:${parent}`], topicTags: [targetCapabilityId], candidateTitle: title, observedAt: "2026-09-15", releaseClaims: [{ direction: "in", boundary: "KIT JSA v1", normalizedBoundary: "kit jsa v1", specificity: "named", observedAt: "2026-09-15", evidenceId: `claim-${parent}` }] }], realityCapability: { id: targetCapabilityId, name: title, status: "future", revision: 3 }, releaseInterpretation: { activeRelease: "KIT JSA v1", activeReleaseSource: "governed_scope_project", policy: "latest_explicit_same_boundary", effectiveClaims: [{ direction: "in", boundary: "KIT JSA v1", normalizedBoundary: "kit jsa v1", specificity: "named", observedAt: "2026-09-15", evidenceId: `claim-${parent}` }], supersededClaims: [], otherBoundaryClaims: [], genericClaims: [] }, method: "scope-reconciler-three-source-2.1" }, status: "suggested",
  })),
};

const longProposal = {
  ...proposal,
  summary: { ...proposal.summary, aligned: 16, suggested: 16 },
  items: [
    ...proposal.items,
    ...Array.from({ length: 12 }, (_, index) => ({
      ...proposal.items[index % proposal.items.length],
      id: `review-only-${index + 1}`,
      title: `Review-only candidate ${index + 1}`,
      confidence: "medium",
      confidenceScore: 72,
    })),
  ],
};

async function installFixtures(page: Page, candidateProposal = longProposal) {
  await page.route("**/api/instrument/project", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }));
  await page.route("**/api/scopes/visual-jsa/proposal", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ proposal: candidateProposal, stale: false }) }));
}

function trackProposalRequests(context: BrowserContext, requests: string[]) {
  context.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.includes("/proposal")) requests.push(`${request.method()} ${pathname}`);
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const requests: string[] = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  trackProposalRequests(context, requests);
  const page = await context.newPage();
  await installFixtures(page);
  await page.goto(`${baseURL}/scope?project=visual-jsa`);
  await page.locator('[data-shoot="reconciliation-workspace"]').waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(deliverableOut, "scope-v2-candidate-path-1440x900.png") });

  assert.equal(await page.getByText("Forecast not ready", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Forecast not ready", { exact: true }).isVisible(), true);
  assert.equal(await page.getByText("Floor", { exact: true }).count(), 0, "noncanonical floor must not render");
  assert.equal(await page.locator('[data-shoot="unmapped-execution-tray"]').count(), 0, "raw horizontal ticket tray is removed");
  const workspaceScroll = page.locator('[data-shoot="scope-workspace-scroll"]');
  await workspaceScroll.evaluate((element) => { element.scrollTop = 0; });
  const releaseTitleGeometry = await page.locator('[data-shoot="release-rack-title"]').evaluate((title) => {
    const titleRect = title.getBoundingClientRect();
    const rackRect = title.closest('[data-shoot="bay-in"]')!.getBoundingClientRect();
    return { titleTop: titleRect.top, titleBottom: titleRect.bottom, rackTop: rackRect.top, rackBottom: rackRect.bottom };
  });
  assert.ok(releaseTitleGeometry.titleTop >= releaseTitleGeometry.rackTop, `release title must not be clipped above its rack: ${JSON.stringify(releaseTitleGeometry)}`);
  assert.ok(releaseTitleGeometry.titleBottom <= releaseTitleGeometry.rackBottom, `release title must remain inside its rack: ${JSON.stringify(releaseTitleGeometry)}`);
  assert.equal(await page.locator('[data-shoot="proposal-card"]').count(), 16);
  const reconciliationSearch = page.getByLabel("Find reconciliation candidate");
  await reconciliationSearch.fill("nearest emergency room");
  assert.equal(await page.locator('[data-proposal-item="proposal-notifications"]').count(), 1, "review search must find a candidate by a child Linear ticket title");
  assert.equal(await page.locator('[data-shoot="proposal-card"]').count(), 4, "child-ticket search should retain only fixture candidates that contain that ticket title");
  await reconciliationSearch.fill("");
  assert.match(await page.locator('[data-shoot="active-release-boundary"]').innerText(), /KIT JSA v1.*governed Scope project/i);
  const candidateRegion = page.locator('[data-shoot="candidate-scroll-region"]');
  const candidateGeometry = await candidateRegion.evaluate((region) => {
    const row = region.querySelector<HTMLElement>('[data-shoot="proposal-card"]');
    return { clientHeight: region.clientHeight, scrollHeight: region.scrollHeight, rowHeight: row?.getBoundingClientRect().height ?? 0 };
  });
  assert.ok(candidateGeometry.clientHeight >= candidateGeometry.rowHeight, `at least one complete candidate must be visible: ${JSON.stringify(candidateGeometry)}`);
  assert.ok(candidateGeometry.scrollHeight > candidateGeometry.clientHeight, "candidate list should expose its own pointer-scroll range");
  await candidateRegion.hover();
  await page.mouse.wheel(0, 380);
  await page.waitForTimeout(150);
  const pointerScrollTop = await candidateRegion.evaluate((region) => region.scrollTop);
  assert.ok(pointerScrollTop > 0, "pointer scrolling should move the candidate list");
  await candidateRegion.evaluate((region) => { region.scrollTop = 0; });
  await candidateRegion.focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.locator('[data-proposal-item="proposal-notifications"]').evaluate((element) => document.activeElement === element), true, "candidate is keyboard reachable after the named list region");
  assert.equal(await page.locator('[data-shoot="stage-aligned"]').innerText(), "Stage 4 aligned");
  assert.equal(await page.locator('[data-shoot="stage-aligned"]').isEnabled(), true);

  await page.locator('[data-capability="capability:crew"]').click();
  await page.locator('[data-shoot="feature-detail"]').waitFor();
  assert.equal(await page.locator('[data-shoot="feature-detail"]').getByText("Uncertainty", { exact: true }).count(), 1, "the range metric must be named uncertainty");
  assert.equal(await page.locator('[data-shoot="feature-detail"]').getByText("Certainty", { exact: true }).count(), 0, "the inverse certainty label must not render");
  await page.locator('[data-shoot="mode-evidence"]').click();
  const attachedEvidence = page.locator('[data-shoot="attached-evidence"]');
  assert.equal(await attachedEvidence.getByText("1 reference", { exact: false }).count(), 1, "accepted evidence count should remain visible");
  await attachedEvidence.locator("summary").click();
  assert.equal(await page.locator('[data-shoot="attached-evidence-list"]').getByText("context:jsa", { exact: true }).isVisible(), true, "the stored evidence reference should be inspectable");
  assert.equal(await page.locator('[data-capability="capability:crew"][data-selected="true"]').count(), 1, "selected capability remains unmistakable behind Focus");
  await page.screenshot({ path: resolve(deliverableOut, "scope-v2-capability-focus.png") });
  await page.locator('[data-shoot="feature-detail"]').getByRole("button", { name: "Close" }).click();

  await page.locator('[data-proposal-item="proposal-notifications"]').click();
  await page.locator('[data-shoot="reconciliation-focus"]').waitFor();
  assert.equal(await page.locator('[data-shoot="proposal-evidence-inspection"]').isVisible(), true);
  assert.match(await page.locator('[data-shoot="focus-release-boundary"]').innerText(), /Interpreted for KIT JSA v1/i);
  const workChoices = page.locator('[data-shoot="proposal-work-choice"]');
  assert.equal(await workChoices.count(), 5, "review focus must expose every ticket in the execution cluster");
  await workChoices.first().getByRole("checkbox").uncheck();
  assert.match(await page.locator('[data-shoot="reconciliation-focus"]').innerText(), /4 of 5 Linear items selected/i);
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(deliverableOut, "scope-v2-proposal-evidence-focus.png") });
  await page.locator('[data-shoot="stage-focused-proposal"]').click();
  await page.locator('[data-shoot="reconciliation-focus"]').getByRole("button", { name: "Close" }).click();
  assert.match(await page.locator('[data-shoot="scenario-strip"]').innerText(), /Scenario[\s\S]*1 intelligence proposal staged[\s\S]*Back to Reality/i);
  assert.match(await page.locator('[data-shoot="reconciliation-scenario-feedback"]').innerText(), /Scenario[\s\S]*1 reviewed change staged[\s\S]*Reality is unchanged/i);
  assert.match(await page.locator('[data-proposal-item="proposal-notifications"]').innerText(), /staged/i);
  await page.screenshot({ path: resolve(deliverableOut, "scope-v2-visible-staging-result-1440x900.png") });

  await page.locator('[data-proposal-item="proposal-notifications"]').click();
  assert.equal(await page.locator('[data-shoot="proposal-work-choice"]').first().getByRole("checkbox").isChecked(), false, "ticket selection must persist in the local Scenario");
  assert.match(await page.locator('[data-shoot="reconciliation-focus"]').innerText(), /4 selected items included in the active Scope Scenario/i);
  await page.locator('[data-shoot="stage-focused-proposal"]').getByText("Unstage change", { exact: true }).click();
  await page.locator('[data-shoot="reconciliation-focus"]').getByRole("button", { name: "Close" }).click();
  assert.match(await page.locator('[data-shoot="scenario-strip"]').innerText(), /Reality/);
  assert.equal(await page.locator('[data-shoot="reconciliation-scenario-feedback"]').count(), 0);

  await page.locator('[data-shoot="stage-aligned"]').click();
  assert.match(await page.locator('[data-shoot="reconciliation-scenario-feedback"]').innerText(), /Scenario[\s\S]*4 reviewed changes staged[\s\S]*Reality is unchanged/i);
  assert.equal(await page.locator('[data-shoot="stage-aligned"]').innerText(), "Stage 0 aligned");
  assert.equal(await page.locator('[data-shoot="stage-aligned"]').isDisabled(), true);
  assert.match(await page.locator('[data-shoot="bulk-stage-explanation"]').innerText(), /All 4 eligible aligned candidates are already staged/i);
  await page.locator('[data-shoot="discard"]').click();
  assert.match(await page.locator('[data-shoot="scenario-strip"]').innerText(), /Reality/);
  assert.equal(await page.locator('[data-shoot="reconciliation-scenario-feedback"]').count(), 0);

  await page.locator('[data-shoot="stage-aligned"]').click();
  await page.reload();
  await page.locator('[data-shoot="reconciliation-workspace"]').waitFor();
  assert.match(await page.locator('[data-shoot="scenario-strip"]').innerText(), /Reality/);
  assert.equal(await page.locator('[data-shoot="reconciliation-scenario-feedback"]').count(), 0, "reload returns to persisted Reality; local Scenario is not persisted");

  const isolatedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  trackProposalRequests(isolatedContext, requests);
  const isolatedPage = await isolatedContext.newPage();
  await installFixtures(isolatedPage);
  await isolatedPage.goto(`${baseURL}/scope?project=visual-jsa`);
  await isolatedPage.locator('[data-shoot="reconciliation-workspace"]').waitFor();
  assert.match(await isolatedPage.locator('[data-shoot="scenario-strip"]').innerText(), /Reality/);
  assert.equal(await isolatedPage.locator('[data-shoot="reconciliation-scenario-feedback"]').count(), 0, "an independent browser never sees another browser's local Scenario");
  await isolatedContext.close();

  const zeroContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  trackProposalRequests(zeroContext, requests);
  const zeroPage = await zeroContext.newPage();
  const zeroEligibleProposal = { ...longProposal, items: longProposal.items.map((item) => ({ ...item, confidence: "medium" })) };
  await installFixtures(zeroPage, zeroEligibleProposal);
  await zeroPage.goto(`${baseURL}/scope?project=visual-jsa`);
  await zeroPage.locator('[data-shoot="reconciliation-workspace"]').waitFor();
  assert.equal(await zeroPage.locator('[data-shoot="stage-aligned"]').innerText(), "Stage 0 aligned");
  assert.equal(await zeroPage.locator('[data-shoot="stage-aligned"]').isDisabled(), true);
  assert.match(await zeroPage.locator('[data-shoot="bulk-stage-explanation"]').innerText(), /No candidates qualify.*aligned, high-confidence, actionable, uncommitted/i);
  await zeroContext.close();

  const overflow = await page.evaluate(() => ({ body: document.body.scrollWidth - innerWidth, root: document.documentElement.scrollWidth - innerWidth }));
  assert.ok(overflow.body <= 1 && overflow.root <= 1, `page should not overflow horizontally: ${JSON.stringify(overflow)}`);

  const safari = await webkit.launch({ headless: true });
  const safariContext = await safari.newContext({ viewport: { width: 1728, height: 1117 }, colorScheme: "dark" });
  trackProposalRequests(safariContext, requests);
  const safariPage = await safariContext.newPage();
  await installFixtures(safariPage);
  await safariPage.goto(`${baseURL}/scope?project=visual-jsa`);
  await safariPage.locator('[data-shoot="reconciliation-workspace"]').waitFor();
  await safariPage.locator('[data-proposal-item="proposal-notifications"]').waitFor();
  const safariCandidateVisible = await safariPage.locator('[data-proposal-item="proposal-notifications"]').isVisible();
  assert.equal(safariCandidateVisible, true);
  await safariPage.locator('[data-shoot="candidate-scroll-region"]').hover();
  await safariPage.mouse.wheel(0, 320);
  await safariPage.waitForTimeout(150);
  assert.ok(await safariPage.locator('[data-shoot="candidate-scroll-region"]').evaluate((region) => region.scrollTop) > 0, "Safari-like pointer scrolling should move the candidate list");
  await safariPage.screenshot({ path: resolve(deliverableOut, "scope-v2-safari-wide-1728x1117.png") });
  await safari.close();

  const proposalCommitRequests = requests.filter((request) => request.endsWith("/proposal/commit"));
  assert.deepEqual(proposalCommitRequests, [], "verification must never commit a proposal");
  const result = { ok: true, proposalCards: 16, overviewMode: true, capabilityFocus: true, uncertaintyLabel: true, attachedEvidenceInspectable: true, releaseTitleVisible: true, releaseTitleGeometry, proposalEvidenceFocus: true, ticketLevelReconciliation: true, activeReleaseBoundary: "KIT JSA v1/governed_scope_project", releaseEvidenceInterpretationVisible: true, candidateGeometry, pointerScrollTop, keyboardCandidateAccess: true, manualStageAndUnstage: true, bulkEligibleCount: 4, zeroEligibleDisabledWithReason: true, scenarioFeedback: true, backToReality: true, reloadRealityPersistence: true, independentBrowserIsolation: true, safariLikeViewport: "1728x1117", safariCandidateVisible, truthBoundary: "forecast-not-ready/no-floor", horizontalOverflow: overflow, proposalCommitRequests: proposalCommitRequests.length };
  writeFileSync(resolve(repoOut, "browser-proof.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

main();
