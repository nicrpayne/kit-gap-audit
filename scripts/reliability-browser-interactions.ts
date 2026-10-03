import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type { BrowserContext } from "playwright";
import { prisma } from "../lib/prisma";

/** Actual DOM interactions against disposable rows, never production fixtures. */
export async function proveRepairInteractions(context: BrowserContext, base: string, output: string, auditHref: string) {
  const database = new URL(process.env.DATABASE_URL!);
  assert(database.hostname === "127.0.0.1" && database.port === "55434" && database.pathname === "/signal_t0_test_1004");
  const key = randomUUID();
  const scopes = [0, 1].map((n) => `repair-ux-${key}-${n}`);
  const people = [0, 1].map((n) => `repair-person-${key}-${n}`);
  const pendingQuoteChangeId = `quote-inbox-${key}`;
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const sh = (id: string) => page.locator(`[data-shoot="${id}"]`);
  try {
    for (const [n, id] of scopes.entries()) {
      await prisma.scope.create({ data: { id, name: n ? "QA Staffing B" : "QA Staffing A", teamKey: "PRF", executionState: "not_configured" } });
      await prisma.capacityReconciliation.create({ data: { scopeId: id, status: "named_exact", legacySource: "allocations", completenessConfirmed: true, namedRawFte: 1, namedEffectiveFte: 1, provenance: { kind: "synthetic-repair-proof" }, history: [] } });
    }
    for (const [n, id] of people.entries()) {
      await prisma.person.create({ data: { id, name: n ? "QA Pancho" : "QA Alpha", fte: 1, active: true } });
      for (const scopeId of scopes) await prisma.allocation.create({ data: { personId: id, scopeId, fraction: 0.5 } });
    }
    await prisma.decision.create({ data: { scopeId: scopes[0], title: "QA already resolved choice", status: "decided", resolution: "Synthetic choice resolved.", decidedAt: new Date() } });
    await page.goto(`${base}/portfolio?project=${scopes[0]}`);
    await sh("bridge-person").filter({ hasText: "QA Pancho" }).click();
    const panchoA = page.getByRole("slider", { name: "QA Pancho on QA Staffing A", exact: true });
    await panchoA.waitFor();
    assert.equal(await page.getByRole("slider", { name: /QA Alpha on/ }).count(), 0, "clicked person's controls open, not first roster row");
    await panchoA.fill("0");
    await page.getByRole("slider", { name: "QA Pancho on QA Staffing B", exact: true }).fill("100");
    await page.keyboard.press("Escape");
    await sh("patchbay").waitFor({ state: "hidden" });
    assert.match(await sh("scenario-bar").innerText(), /1 person reallocated/i, "one transfer across two projects counts one person");
    await page.screenshot({ path: `${output}/06-person-transfer.png` });
    await page.goto(`${base}/decisions?project=${scopes[0]}`);
    await page.getByRole("button", { name: /QA already resolved choice/ }).first().click();
    const inspector = sh("decision-inspector");
    await inspector.waitFor();
    assert.doesNotMatch(await inspector.innerText(), /An open question/i);
    assert.match(await inspector.innerText(), /closed|decided|resolved/i);
    await page.screenshot({ path: `${output}/07-closed-decision.png` });
    await page.goto(`${base}/control-room?project=${scopes[0]}`);
    await sh("cr-views").click();
    await sh("cr-views-menu").waitFor();
    await page.keyboard.press("Escape");
    await sh("cr-views-menu").waitFor({ state: "hidden" });
    await sh("cr-lens-editor-open").click();
    await page.getByRole("dialog", { name: "Customize this workspace" }).waitFor();
    await page.keyboard.press("Escape");
    await sh("cr-lens-editor").waitFor({ state: "hidden" });

    const quoteScopeId = new URL(auditHref, base).searchParams.get("project")!;
    assert(quoteScopeId);
    await prisma.auditChangeProposal.create({ data: {
      id: pendingQuoteChangeId, scopeId: quoteScopeId, fingerprint: pendingQuoteChangeId,
      category: "decision", owner: "decisions", changeType: "create_open_decision",
      title: "QA pending review must not cover quote", summary: "Synthetic inbox race regression",
      whyProposed: "QA only", currentState: {}, proposedState: { action: "create_open_decision" },
      evidence: [], retrievalBasis: "qa", relevanceReason: "QA project local", sourceKind: "setup", status: "pending",
    } });
    const inboxRead = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/audit/changes");
    await page.goto(`${base}${auditHref}`);
    const inbox = await (await inboxRead).json();
    assert(inbox.total > 0, "the regression requires asynchronous pending inbox content");
    await page.getByRole("button", { name: new RegExp(`^${inbox.total} Changes since last Audit`) }).waitFor();
    assert.equal(await page.locator('[data-shoot="audit-change-inbox"]').count(), 0,
      "loading a pending inbox must not obscure an explicit evidence deep link");
    const frame = page.frameLocator("iframe").first();
    await frame.getByRole("button", { name: "View here", exact: true }).click();
    const viewer = frame.locator("#brain-viewer");
    await viewer.waitFor({ state: "visible" });
    assert.match(await viewer.innerText(), /four to eight developer days/);
    let visibleAboveInspector = false;
    for (let attempt = 0; attempt < 30 && !visibleAboveInspector; attempt += 1) {
      visibleAboveInspector = await viewer.evaluate((element) => {
        const r = element.getBoundingClientRect();
        const x = Math.min(innerWidth - 10, r.x + r.width / 2), y = Math.min(innerHeight - 10, r.y + 70);
        const top = document.elementFromPoint(x, y);
        return x >= r.left && r.right <= innerWidth + 1 && !!top && element.contains(top);
      });
      if (!visibleAboveInspector) await page.waitForTimeout(100);
    }
    assert(visibleAboveInspector, "exact quote viewer is visibly on top, not hidden under the inspector");
    await page.screenshot({ path: `${output}/08-audit-exact-quote.png` });
  } catch (error) {
    await page.screenshot({ path: `${output}/interaction-failure.png` });
    await writeFile(`${output}/interaction-failure.txt`, await page.locator("body").innerText());
    throw error;
  } finally {
    await page.close();
    await prisma.auditChangeProposal.deleteMany({ where: { id: pendingQuoteChangeId } });
    await prisma.scope.deleteMany({ where: { id: { in: scopes } } });
    await prisma.person.deleteMany({ where: { id: { in: people } } });
  }
}
