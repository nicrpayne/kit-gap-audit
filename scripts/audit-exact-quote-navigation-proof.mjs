// Behavioral regression for the protected Audit host's exact-quote bridge.
// Runs the actual browser asset in a same-origin iframe with a minimal Rubric
// runtime. It does not touch application APIs, providers, or the database.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const origin = "http://audit-quote-proof.test";
const exactNodeId = "passage:snapshot-A:evidence-7";
const decoyNodeId = "passage:snapshot-B:evidence-7";
const hostSource = readFileSync("public/audit-rubric-phase2/phase2-host.js", "utf8");

const frameHtml = `<!doctype html>
<html><body>
  <canvas id="brain-canvas"></canvas>
  <script>
    const exact = { id: ${JSON.stringify(exactNodeId)}, label: "Exact frozen quote" };
    const decoy = { id: ${JSON.stringify(decoyNodeId)}, label: "Same evidence id, newer snapshot" };
    window.__auditProofCalls = { selected: [], flown: [] };
    window.BrainCore = {
      S: {
        meta: { scopeId: "scope-A", auditContext: { mode: "current" }, traceByNode: {} },
        byId: new Map([[exact.id, exact], [decoy.id, decoy]]),
        nodes: [exact, decoy],
        sel: null,
        skin: {},
        cam: { x: 0, y: 0, k: 1 },
        refreshData: async () => {},
      },
      select(node) {
        this.S.sel = node;
        window.__auditProofCalls.selected.push(node ? node.id : null);
      },
      flyToNode(node) { window.__auditProofCalls.flown.push(node.id); },
      toast() {},
      openViewer() {},
    };
  </script>
  <script src="/phase2-host.js"></script>
  <script>document.body.appendChild(document.createElement("i"));</script>
</body></html>`;

const parentHtml = `<!doctype html>
<html><body>
  <script>
    window.__auditProofMessages = [];
    window.addEventListener("message", event => {
      window.__auditProofMessages.push({
        type: event.data && event.data.type,
        nodeId: event.data && event.data.nodeId,
        origin: event.origin,
        sourceIsAudit: event.source === document.getElementById("audit")?.contentWindow,
      });
    });
  </script>
  <iframe id="audit" src="/frame"></iframe>
  <iframe id="sibling" src="/sibling"></iframe>
</body></html>`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route(`${origin}/**`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/phase2-host.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: hostSource });
    } else if (pathname === "/frame") {
      await route.fulfill({ status: 200, contentType: "text/html", body: frameHtml });
    } else if (pathname === "/sibling") {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>sibling</title>" });
    } else {
      await route.fulfill({ status: 200, contentType: "text/html", body: parentHtml });
    }
  });

  await page.goto(origin, { waitUntil: "load" });
  await page.waitForFunction(() => window.__auditProofMessages.some(message => message.type === "signal-audit-world-ready"));
  const audit = page.frames().find(frame => new URL(frame.url()).pathname === "/frame");
  const sibling = page.frames().find(frame => new URL(frame.url()).pathname === "/sibling");
  assert(audit && sibling, "the proof requires both same-origin child frames");

  const state = () => audit.evaluate(() => ({
    calls: structuredClone(window.__auditProofCalls),
    selectedId: window.BrainCore.S.sel?.id ?? null,
  }));
  const selectionReplies = () => page.evaluate(() => window.__auditProofMessages.filter(message =>
    message.type === "signal-audit-selection-applied" || message.type === "signal-audit-selection-missing"
  ));

  // A forged cross-origin event with the real parent as source is rejected.
  await audit.evaluate(nodeId => {
    window.dispatchEvent(new MessageEvent("message", {
      data: { type: "signal-audit-select-node", nodeId },
      origin: "https://attacker.invalid",
      source: window.parent,
    }));
  }, decoyNodeId);
  await page.waitForTimeout(50);
  assert.deepEqual(await state(), { calls: { selected: [], flown: [] }, selectedId: null });
  assert.deepEqual(await selectionReplies(), []);

  // A same-origin sibling still is not the parent and cannot drive selection.
  await sibling.evaluate(nodeId => {
    window.parent.document.getElementById("audit").contentWindow.postMessage(
      { type: "signal-audit-select-node", nodeId },
      window.parent.location.origin,
    );
  }, decoyNodeId);
  await page.waitForTimeout(50);
  assert.deepEqual(await state(), { calls: { selected: [], flown: [] }, selectedId: null });
  assert.deepEqual(await selectionReplies(), []);

  // The parent selects by the full snapshot-qualified key. A passage with the
  // same evidence suffix in another snapshot must not be chosen accidentally.
  await page.evaluate(nodeId => {
    document.getElementById("audit").contentWindow.postMessage(
      { type: "signal-audit-select-node", nodeId },
      window.location.origin,
    );
  }, exactNodeId);
  await page.waitForFunction(nodeId => window.__auditProofMessages.some(message =>
    message.type === "signal-audit-selection-applied" && message.nodeId === nodeId
  ), exactNodeId);
  assert.deepEqual(await state(), {
    calls: { selected: [exactNodeId], flown: [exactNodeId] },
    selectedId: exactNodeId,
  });
  assert.deepEqual(await selectionReplies(), [{
    type: "signal-audit-selection-applied",
    nodeId: exactNodeId,
    origin,
    sourceIsAudit: true,
  }]);

  // A missing exact passage is reported without changing the current
  // selection or moving the camera to a fuzzy/related node.
  const missingNodeId = "passage:snapshot-A:missing-evidence";
  await page.evaluate(nodeId => {
    document.getElementById("audit").contentWindow.postMessage(
      { type: "signal-audit-select-node", nodeId },
      window.location.origin,
    );
  }, missingNodeId);
  await page.waitForFunction(nodeId => window.__auditProofMessages.some(message =>
    message.type === "signal-audit-selection-missing" && message.nodeId === nodeId
  ), missingNodeId);
  assert.deepEqual(await state(), {
    calls: { selected: [exactNodeId], flown: [exactNodeId] },
    selectedId: exactNodeId,
  });

  console.log("PASS Audit exact-quote navigation: exact snapshot-qualified selection and camera focus");
  console.log("PASS Audit exact-quote navigation: missing nodes fail closed without fuzzy fallback");
  console.log("PASS Audit exact-quote navigation: cross-origin and same-origin non-parent senders are rejected");
} finally {
  await browser.close();
}
