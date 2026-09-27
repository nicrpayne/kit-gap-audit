import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import {
  adaptSignalGraphToRubric,
  validateSignalRubricPayload,
  type ExportedSignalGraph,
} from "../lib/audit/signalRubricAdapter";
import { projectIntelligence } from "../lib/audit/intelligence";
import { projectRequirements } from "../lib/audit/requirements";

const passageId = "passage:snapshot-proof:passage-proof";
const sourceRef = "fixture://audit-inspector-source";
const surroundingContext = "The fixture speaker was explicitly discussing remaining work.";
const evidence = {
  id: "passage-proof",
  sourceRef,
  kind: "passage",
  excerpt: "Four to six developer-days remain.",
  data: { surroundingContext },
};
const source = {
  sourceType: "transcript",
  sourceRef,
  registrationId: null,
  role: "raw_evidence",
  status: "active",
  observedAt: "2026-09-27T12:00:00.000Z",
  succeeded: true,
  detail: null,
};
const projectedIntelligence = projectIntelligence([{
  id: "snapshot-proof",
  scopeId: "scope-proof",
  package: {
    sources: [source],
    evidence: [evidence],
    intelligenceObjects: [{
      id: "claim-proof",
      intelligenceType: "estimate",
      trust: "external_intelligence",
      statement: "A stored fixture claim.",
      isCurrent: true,
      scope: ["scope-proof"],
      evidenceRefs: [evidence.id],
    }],
    intelligenceRelations: [],
  },
}], "scope-proof");
assert.equal(projectedIntelligence.citedPassages[0]?.surroundingContext, surroundingContext,
  "intelligence projection must carry only stored surrounding context");
const projectedRequirements = projectRequirements([{
  id: "snapshot-proof",
  scopeId: "scope-proof",
  package: { sources: [{ ...source, role: "requirements_of_record" }], evidence: [evidence] },
}]);
assert.equal(projectedRequirements[0]?.surroundingContext, surroundingContext,
  "requirement projection must carry only stored surrounding context");
const absentContext = projectRequirements([{
  id: "snapshot-without-context",
  scopeId: "scope-proof",
  package: {
    sources: [{ ...source, role: "requirements_of_record" }],
    evidence: [{ ...evidence, data: undefined }],
  },
}]);
assert.equal(absentContext[0]?.surroundingContext, null,
  "missing context must remain absent rather than being reconstructed");

const graph: ExportedSignalGraph = {
  nodes: [
    {
      key: "reality",
      attributes: { kind: "reality", label: "Reality", slice: "core", ref: "Reality:proof" },
    },
    {
      key: passageId,
      attributes: {
        kind: "passage",
        label: "passage-proof",
        slice: "evidence",
        ref: "EvidenceItem:snapshot-proof:passage-proof",
        excerpt: "Four to six developer-days remain.",
        surroundingContext,
        sourceRef,
      },
    },
    {
      key: `source:pkg:${sourceRef}`,
      attributes: {
        kind: "transcript",
        label: sourceRef,
        slice: "evidence",
        ref: `PackageSource:${sourceRef}`,
        sourceType: "transcript",
      },
    },
  ],
  edges: [
    {
      source: passageId,
      target: `source:pkg:${sourceRef}`,
      attributes: {
        rel: "extracted_from",
        basis: "attested",
        rule: "passage-extracted-from-source",
      },
    },
  ],
};

const payload = adaptSignalGraphToRubric(graph, { id: "scope-proof", name: "Audit inspector proof" });
assert.deepEqual(validateSignalRubricPayload(payload), []);
const passage = payload.nodes.find((node) => node.canonicalId === passageId);
assert(passage, "snapshot-qualified passage must survive the adapter");
assert.equal(passage.sourceRef, sourceRef, "exact sourceRef must survive the adapter");
assert.equal(passage.canonicalId, passageId, "snapshot-qualified identity must survive the adapter");
assert.equal(passage.attributes?.surroundingContext, surroundingContext, "stored surrounding context must survive verbatim");
const passageSummary = {
  canonicalId: passage.canonicalId,
  sourceRef: passage.sourceRef,
  surroundingContext: passage.attributes?.surroundingContext,
};

const phase2 = readFileSync("public/audit-rubric-phase2/phase2-host.js", "utf8");
const phase3 = readFileSync("public/audit-rubric-phase3/phase3-host.js", "utf8");
const route = readFileSync("app/audit/rubric-phase3/route.ts", "utf8");
const graphBuilder = readFileSync("lib/audit/graph.ts", "utf8");

assert.match(phase2, /function patchSearchResults\(\)/);
assert.match(phase2, /row\.setAttribute\('role', 'option'\)/);
assert.match(phase2, /row\.setAttribute\('tabindex', '0'\)/);
assert.match(phase2, /event\.key === 'Enter' \|\| event\.key === ' '/);
assert.match(phase2, /row\.click\(\)/);
assert.match(phase2, /event\.key !== 'ArrowDown'/);
assert.match(phase2, /aria-label', 'Search Audit objects'/);

assert.match(phase3, /appendPassageProvenanceRow\(list, 'Source reference', node\.sourceRef\)/);
assert.match(phase3, /appendPassageProvenanceRow\(list, 'Snapshot-qualified passage', node\.canonicalId\)/);
assert.match(phase3, /appendPassageProvenanceRow\(list, 'Surrounding context', node\.attributes && node\.attributes\.surroundingContext\)/);
assert.match(phase3, /close\.setAttribute\('aria-label', 'Close Inspector'\)/);
assert.match(route, /\.signal-passage-provenance/);
assert.match(route, /#brain-results \.res:focus-visible/);
assert.match(graphBuilder, /surroundingContext: psg\.surroundingContext \?\? null/);

async function verifyActualHostDom() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <input id="brain-search">
      <div id="brain-results" style="display:block">
        <div class="res" data-path="${passageId}" data-type="file">Exact passage result</div>
      </div>
      <div id="brain-card" style="display:block">
        <div class="card-head"><button id="card-close">×</button></div>
        <div class="card-actions"></div>
      </div>
    `);
    await page.evaluate(({ canonicalId, exactSourceRef, context }) => {
      const input = document.getElementById("brain-search") as HTMLInputElement;
      const results = document.getElementById("brain-results") as HTMLElement;
      input.onblur = () => { setTimeout(() => { results.style.display = "none"; }, 250); };
      document.querySelector<HTMLElement>(".res")!.onclick = () => { document.body.dataset.selected = canonicalId; };
      (window as typeof window & { BrainCore: unknown }).BrainCore = {
        S: {
          meta: { canonicalNodes: 1 },
          cam: { x: 0, y: 0, k: 1 },
          sel: {
            id: canonicalId,
            canonicalId,
            canonicalRef: `EvidenceItem:${canonicalId}`,
            kind: "passage",
            layer: "M",
            realityRelationship: "unassessed",
            sourceRef: exactSourceRef,
            attributes: { surroundingContext: context },
          },
        },
        select() {},
      };
    }, { canonicalId: passageId, exactSourceRef: sourceRef, context: surroundingContext });
    await page.addScriptTag({ path: resolve("public/audit-rubric-phase2/phase2-host.js") });
    await page.addScriptTag({ path: resolve("public/audit-rubric-phase3/phase3-host.js") });
    await page.evaluate(() => document.body.appendChild(document.createElement("i")));

    const option = page.getByRole("option", { name: "Exact passage result" });
    await option.waitFor({ state: "visible" });
    const input = page.getByRole("textbox", { name: "Search Audit objects" });
    await input.focus();
    await page.keyboard.press("ArrowDown");
    assert.equal(await option.evaluate((element) => element === document.activeElement), true,
      "ArrowDown must move keyboard focus into results");
    await page.waitForTimeout(350);
    assert.equal(await option.isVisible(), true,
      "the native blur timeout must not hide results while an option has keyboard focus");
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("body").getAttribute("data-selected"), passageId,
      "Enter must invoke the native result selection");

    const provenance = page.locator('.signal-passage-provenance[aria-label="Exact passage provenance"]');
    await provenance.waitFor({ state: "visible" });
    const inspector = page.locator("#brain-card");
    const inspectorText = await inspector.innerText();
    assert(inspectorText.includes(sourceRef));
    assert(inspectorText.includes(passageId));
    assert(inspectorText.includes(surroundingContext));
    assert.equal(await page.locator("#card-close").getAttribute("aria-label"), "Close Inspector");
  } finally {
    await browser.close();
  }
}

async function main() {
  await verifyActualHostDom();
  console.log(JSON.stringify({
    ok: true,
    passage: passageSummary,
    accessibility: {
      searchResultsKeyboardFocusable: true,
      enterSelectsResult: true,
      arrowNavigation: true,
      nativeBlurKeepsFocusedResultsVisible: true,
      closeInspectorAccessibleName: "Close Inspector",
    },
  }));
}

void main();
