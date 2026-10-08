import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import type { ContextSnapshot, Finding } from "@prisma/client";
import { evidenceAnchor, evidenceIndependence, evidenceSourceDate } from "../lib/audit/evidenceMetadata";
import { projectIntelligence } from "../lib/audit/intelligence";
import { projectRequirements } from "../lib/audit/requirements";
import { resolveProvenance } from "../lib/audit/provenance";
import { buildAuditGraph, exportAuditGraph, nodeId, type BuildGraphInput } from "../lib/audit/graph";
import { adaptSignalGraphToRubric, validateSignalRubricPayload } from "../lib/audit/signalRubricAdapter";

// Pure projection/DOM-contract proof. No browser, network or database is used.
const evidence = {
  id: "quote", sourceRef: "ke://source/transcript/2026-08-18-Harbor-Sync.txt",
  kind: "passage", excerpt: 'Three to five days remain. <script>doNotRun()</script>',
  independence: "derivative" as const,
  data: { meeting_date: "2026-08-18", char_start: 0, char_end: 27, offset_unit: "unicode_code_points" },
  extra: { passageHash: "sha256:producer-hash" },
};
const anchor = { quoteHash: "sha256:producer-hash", charStart: 0, charEnd: 27, offsetUnit: "unicode_code_points" };
assert.deepEqual(evidenceAnchor(evidence), anchor);
assert.deepEqual(evidenceAnchor({ data: { charStart: 4, char_start: 8, quoteHash: "original" }, extra: { charStart: 9, passageHash: "copy" } }), { charStart: 4, quoteHash: "original" });
assert.deepEqual(evidenceAnchor({ data: {}, extra: { passageHash: null } }), {});
assert.equal(evidenceIndependence(evidence), "derivative");
assert.equal(evidenceIndependence({}), null);
assert.equal(evidenceSourceDate(evidence), "2026-08-18");
assert.equal(evidenceSourceDate({ data: { occurredAt: "2026-08-19T15:00:00-05:00", meeting_date: "2026-08-18" } }), "2026-08-19T15:00:00-05:00");
for (const value of ["not exposed by the system", "2026-02-30", "2026-13-01", "today", "2026-08-19T99:00:00Z", ""]) {
  assert.equal(evidenceSourceDate({ data: { source_date: value } }), null, value);
}
assert.equal(evidenceSourceDate({ data: { retrieved_date: "2026-10-08", observedAt: "2026-10-08" }, extra: { acceptedAt: "2026-10-08" } }), null);
const source = { sourceType: "transcript", sourceRef: evidence.sourceRef, registrationId: null, role: "requirements_of_record", status: "active", observedAt: "2026-10-08T12:00:00Z", succeeded: true, detail: null };
const snapshot = {
  id: "snapshot", scopeId: "qa", producer: "fictional-proof", packageId: "package", createdAt: new Date("2026-10-08T12:01:00Z"),
  package: {
    sources: [source], evidence: [evidence],
    intelligenceObjects: [{ id: "claim", intelligenceType: "estimate", trust: "external_intelligence", statement: "Remaining work", isCurrent: true, scope: ["qa"], evidenceRefs: ["quote"] }],
    intelligenceRelations: [],
  },
};
const intelligence = projectIntelligence([snapshot], "qa");
const requirements = projectRequirements([snapshot]);
const finding = { id: "finding", quote: evidence.excerpt, evidenceRefs: ["quote"], matchedIssues: [] } as unknown as Finding;
const provenance = resolveProvenance(finding, snapshot as unknown as ContextSnapshot, null);
for (const projection of [intelligence.citedPassages[0], requirements[0], provenance.passages[0]]) {
  assert.equal(projection.sourceDate, "2026-08-18");
  assert.equal(projection.observedAt, "2026-10-08T12:00:00Z");
  assert.deepEqual(projection.anchor, anchor);
  assert.equal(projection.independence, "derivative");
}
const modelFinding: BuildGraphInput["model"]["findings"][number] = {
  id: "finding", type: "risk", kindLabel: "Risk", title: "Fixture", tier: "low", state: "drift", needsHuman: false, laneId: "evidence", relatedLaneIds: [], severity: "low", blocking: false, status: "open", quote: evidence.excerpt, rationale: "Fixture", owner: null, blocks: null, matchedIssues: [], estimateHint: null, createdAt: "2026-10-08", cited: true, evidenceRefCount: 1, handled: false,
};
const passageId = nodeId.passage("snapshot", "quote");
let displayed: ReturnType<typeof adaptSignalGraphToRubric>["nodes"][number] | undefined;
for (const first of ["requirement", "finding", "intelligence"]) {
  const graph = buildAuditGraph({
    model: { scopeId: "qa", scopeName: "QA", lanes: [], findings: first === "finding" ? [modelFinding] : [], totals: { all: 0, critical: 0, needsHuman: 0, handled: 0 }, lastRunAt: null, priorRunAt: null, unsuppliedLaneIds: [] },
    provenance: { finding: provenance },
    entities: { scope: { id: "qa", name: "QA", dependsOnScopeIds: [], notionPageIds: [], figmaRefs: [] }, decisions: [], dependsOn: [], work: [], registrations: [], people: [], findingCitations: [], requirements: first === "requirement" ? requirements : [], intelligence },
  });
  assert.equal(graph.getNodeAttribute(passageId, "sourceDate"), "2026-08-18", first);
  assert.deepEqual(graph.getNodeAttribute(passageId, "anchor"), anchor, first);
  const payload = adaptSignalGraphToRubric(exportAuditGraph(graph), { id: "qa", name: "QA" });
  assert.deepEqual(validateSignalRubricPayload(payload), []);
  displayed = payload.nodes.find(node => node.canonicalId === passageId);
  assert.equal(displayed?.attributes?.sourceDate, "2026-08-18", first);
  assert.equal(displayed?.attributes?.excerpt, evidence.excerpt, first);
}

// Exercise the actual viewer function with inert elements, not a substitute
// implementation. Independent staging browser acceptance remains separate.
class Element {
  textContent = "";
  children: Element[] = [];
  classList = { add() {} };
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  appendChild(element: Element) { this.children.push(element); return element; }
  replaceChildren() { this.children = []; }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  focus() {}
  text(): string { return [this.textContent, ...this.children.map(child => child.text())].join("\n"); }
}
const elements = new Map([".v-title", ".v-path", ".v-body", ".v-close"].map(key => [key, new Element()]));
const viewer = Object.assign(new Element(), { querySelector: (key: string) => elements.get(key) });
const host = readFileSync("public/audit-rubric-phase2/phase2-host.js", "utf8");
const viewerFunction = host.slice(host.indexOf("  function openPassageViewer(n) {"), host.indexOf("\n  function action(event) {"));
assert(viewerFunction.includes("function openPassageViewer"));
const context = vm.createContext({ document: { getElementById: () => viewer, createElement: () => new Element() }, window: { BrainCore: { S: { byId: new Map() } } } });
vm.runInContext(viewerFunction, context);
const show = (node: unknown) => { context.node = node; vm.runInContext("openPassageViewer(node)", context); return elements.get(".v-body")!.text(); };
const text = show(displayed);
assert(text.includes("Source date supplied with quote: 2026-08-18"));
assert(!text.includes("2026-10-08"), "a fresh retrieval never redates the conversation");
assert(text.includes(evidence.excerpt));
assert(text.includes('"charStart": 0'));
assert(text.includes("full conversation text was not supplied"));
assert(text.includes("No original web link was supplied"));
const inferred = show({ ...displayed, attributes: { excerpt: "Other quote" } });
assert(inferred.includes("Conversation date in source reference: 2026-08-18"));
const undated = show({ ...displayed, sourceRef: "fixture://undated", attributes: { excerpt: "Third quote", observedAt: "2026-10-08" } });
assert(undated.includes("Conversation date not supplied"));
assert(!undated.includes("2026-08-18"));
assert(!undated.includes("2026-10-08"));
assert(!undated.includes('"charStart"'));
console.log("PASS: source-date honesty, camel/snake anchors, all three projection paths, canonical graph/adapter, actual viewer DOM contract and missing-data isolation (pure test; not browser acceptance)");
