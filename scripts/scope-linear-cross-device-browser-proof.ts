import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Locator, type Page } from "playwright";

const baseURL = process.env.SIGNAL_PROOF_URL ?? "http://localhost:3311";
const out = resolve("artifacts/scope-linear-cross-device-workflow/screenshots");
mkdirSync(out, { recursive: true });

async function shot(page: Page, name: string) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: resolve(out, name), fullPage: false });
}

async function drag(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  assert.ok(from && to, "drag source and target must be visible");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 14 });
  await page.mouse.up();
}

async function addCapability(page: Page, name: string, reality: boolean) {
  await page.locator('[data-shoot="add-feature"]').first().click();
  await page.locator("#feature-name").fill(name);
  await page.locator("#feature-intent").fill(`${name} operator outcome.`);
  await page.locator("#feature-note").fill("Cross-device browser proof.");
  await page.locator(reality ? '[data-shoot="create-feature-reality"]' : '[data-shoot="create-feature-scenario"]').click();
  await page.getByText(name, { exact: true }).first().waitFor();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const a = await browser.newContext({ viewport: { width: 1500, height: 980 }, colorScheme: "dark" });
  const b = await browser.newContext({ viewport: { width: 1500, height: 980 }, colorScheme: "dark" });
  const pageA = await a.newPage();
  const pageB = await b.newPage();
  const result: Record<string, unknown> = {};

  await Promise.all([pageA.goto(`${baseURL}/scope`), pageB.goto(`${baseURL}/scope`)]);
  await Promise.all([
    pageA.locator('[data-shoot="scope-product-shape-summary"]').waitFor(),
    pageB.locator('[data-shoot="scope-product-shape-summary"]').waitFor(),
  ]);
  await shot(pageA, "01-browser-a-initial.png");
  await shot(pageB, "02-browser-b-initial.png");
  await pageA.goto(`${baseURL}/forecast`);
  await pageA.waitForTimeout(500);
  await shot(pageA, "03-forecast-before.png");
  await pageA.goto(`${baseURL}/scope`);
  await pageA.locator('[data-shoot="unmapped-execution-tray"]').waitFor();

  // Drag current Linear work onto accepted product shape, then explicitly commit.
  await drag(
    pageA,
    pageA.locator('[data-work-id="JSA-100"]'),
    pageA.locator('[data-shoot="bay-in"]').getByText("Notifications", { exact: true }).first(),
  );
  await pageA.locator('[data-shoot="scope-impact-preview"]').waitFor();
  await shot(pageA, "04-link-work-impact-preview.png");
  await pageA.locator('[data-shoot="commit-scope-reality"]').click();
  await pageA.locator('[data-shoot="scope-impact-preview"]').waitFor({ state: "hidden" });
  await pageA.locator('[data-work-id="JSA-100"]').waitFor({ state: "hidden" });
  await pageB.reload();
  await pageB.locator('[data-shoot="scope-product-shape-summary"]').waitFor();
  await pageB.locator('[data-work-id="JSA-100"]').waitFor({ state: "hidden" });
  await shot(pageB, "05-browser-b-after-link.png");
  result.linkVisibleInB = true;

  // A governed create is visible after a normal reload in the other context.
  await addCapability(pageA, "Field Briefing", true);
  await shot(pageA, "06-add-capability-reality.png");
  await pageB.reload();
  await pageB.getByText("Field Briefing", { exact: true }).first().waitFor();
  result.addVisibleInB = true;

  // Edit the accepted row and verify the second context sees the new revision.
  await pageA.getByText("Field Briefing", { exact: true }).first().click();
  await pageA.locator('[data-shoot="edit-capability-reality"]').click();
  await pageA.locator('[data-shoot="edit-capability-reality"] input').first().fill("Field Briefing & Handoff");
  await pageA.locator('[data-shoot="save-capability-reality"]').click();
  await pageA.getByText("Field Briefing & Handoff", { exact: true }).first().waitFor();
  await pageB.reload();
  await pageB.getByText("Field Briefing & Handoff", { exact: true }).first().waitFor();
  await shot(pageB, "07-browser-b-after-edit.png");
  result.editVisibleInB = true;

  // A Scenario draft stays in Browser A and does not appear as Reality in B.
  await addCapability(pageA, "Scenario Only", false);
  await shot(pageA, "08-browser-a-scenario-only.png");
  await pageB.reload();
  assert.equal(await pageB.getByText("Scenario Only", { exact: true }).count(), 0);
  await shot(pageB, "09-browser-b-scenario-isolated.png");
  result.scenarioHiddenFromB = true;

  // Explicit Scenario commit converts the draft through the canonical owner.
  await pageA.getByText("Scenario Only", { exact: true }).first().click();
  await pageA.locator('[data-shoot="commit-draft-reality"]').click();
  await pageA.getByText("Scenario Only", { exact: true }).first().waitFor();
  await pageB.reload();
  await pageB.getByText("Scenario Only", { exact: true }).first().waitFor();
  await shot(pageB, "10-browser-b-after-scenario-commit.png");
  result.scenarioCommitVisibleInB = true;

  // Accepted capability -> outside rail: drag previews first, commit second.
  await drag(
    pageA,
    pageA.locator('[data-shoot="bay-in"]').getByText("Notifications", { exact: true }).first(),
    pageA.locator('[data-shoot="bay-out"]'),
  );
  await pageA.locator('[data-shoot="scope-impact-preview"]').waitFor();
  await shot(pageA, "11-move-out-impact-preview.png");
  await pageA.locator('[data-shoot="commit-scope-reality"]').click();
  await pageA.locator('[data-shoot="scope-impact-preview"]').waitFor({ state: "hidden" });
  await pageB.reload();
  await pageB.locator('[data-shoot="governed-outside-capability"]', { hasText: "Notifications" }).waitFor();
  await shot(pageB, "12-browser-b-after-move-out.png");
  result.moveOutVisibleInB = true;

  // Governed outside capability -> active release uses the same preview/commit law.
  await drag(
    pageA,
    pageA.locator('[data-shoot="governed-outside-capability"]', { hasText: "PDF / Docufy" }),
    pageA.locator('[data-shoot="bay-in"]'),
  );
  await pageA.locator('[data-shoot="scope-impact-preview"]').waitFor();
  await pageA.locator('[data-shoot="commit-scope-reality"]').click();
  await pageA.locator('[data-shoot="scope-impact-preview"]').waitFor({ state: "hidden" });
  await pageB.reload();
  await pageB.locator('[data-shoot="bay-in"]').getByText("PDF / Docufy", { exact: true }).first().waitFor();
  await shot(pageB, "13-browser-b-after-move-in.png");
  result.moveInVisibleInB = true;

  // Navigation/back-forward revalidates rather than resurrecting the old snapshot.
  await pageB.goto(`${baseURL}/forecast`);
  await pageB.waitForTimeout(500);
  await shot(pageB, "14-forecast-after.png");
  await pageB.goBack();
  await pageB.locator('[data-shoot="bay-in"]').getByText("PDF / Docufy", { exact: true }).first().waitFor();
  result.backForwardStayedCurrent = true;

  writeFileSync(resolve(out, "browser-proof.json"), JSON.stringify({ ok: true, ...result }, null, 2));
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  await a.close();
  await b.close();
  await browser.close();
}

main();
