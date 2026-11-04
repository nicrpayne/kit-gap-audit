import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SourceDescription from "../components/instrument/SourceDescription";
import { ReconciliationFocus, type ScopeProposalItemView } from "../components/instrument/ScopeReconciliation";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const description = "### Outcome\n\nAn app usable on field phones.\n\n### Acceptance criteria\n\nGiven a distribution path\nWhen the date arrives\nThen install the app\n\nGiven a release is cut\nWhen it is ready\nThen follow the documented process\n\n### Out of scope\n\n* The CI/CD pipeline\n* An additional workflow";
const item: ScopeProposalItemView = {
  id: "test", title: "A fictional release", description,
  origins: ["knowledge", "reality", "linear"], reconciliationState: "aligned", conflicts: [],
  releaseSignal: "likely_in", confidence: "high", confidenceScore: 95, matchState: "corroborated",
  action: "link_existing", targetCapabilityId: "cap", targetRevision: 11, workItemIds: ["TEST-1"], alreadyLinkedItemIds: ["TEST-1"],
  rationale: { headline: "Evidence matches", signals: [], cautions: [] },
  provenance: { linearParent: null, linearParents: [], linearItems: [], contextSnapshotId: null, contextRefs: [], realityCapability: { id: "cap", name: "A fictional release", status: "accepted", revision: 11 }, method: "fixture" },
  status: "pending",
};
const before = structuredClone(item);
const render = (text: string, possibleLegacyExcerpt = false) => renderToStaticMarkup(<SourceDescription text={text} possibleLegacyExcerpt={possibleLegacyExcerpt} />);
const html = render(description);
for (const heading of ["Outcome", "Acceptance criteria", "Out of scope"]) assert.match(html, new RegExp(`<h3[^>]*>${heading}</h3>`));
assert(!html.includes("###"));
assert.match(html, /<ul>\n<li>The CI\/CD pipeline<\/li>\n<li>An additional workflow<\/li>\n<\/ul>/);
assert(html.includes("Given a distribution path\nWhen the date arrives\nThen install the app"));
assert(html.includes("[&amp;_p]:whitespace-pre-line"), "soft newlines stay visible");
assert.match(render("Plain text\nsecond line\n\nsecond paragraph"), /<p>Plain text\nsecond line<\/p>\n<p>second paragraph<\/p>/);
assert.match(render("**Bold** and *emphasis* and `code`"), /<strong>Bold<\/strong> and <em>emphasis<\/em> and <code>code<\/code>/);
assert.match(render("1. First\n2. Second"), /<ol>/);
const unsafe = render('<script>alert(1)</script>\n\n[bad](javascript:alert) [data](data:text/html,test) [good](https://example.com)\n\n![tracker](https://tracker.invalid/pixel.png)');
assert(!unsafe.includes("<script>")); assert(!unsafe.includes('href="javascript:')); assert(!unsafe.includes('href="data:'));
assert(!unsafe.includes("<img")); assert(unsafe.includes("[Image: tracker]")); assert.match(unsafe, /href="https:\/\/example.com" target="_blank" rel="noopener noreferrer"/);
assert(!render(description).includes("shortened import"));
assert(render(description, true).includes("may be a shortened import"));
const noop = () => {};
const focus = renderToStaticMarkup(<ReconciliationFocus item={item} nextItem={null} capabilities={[]} committing={false} onClose={noop} onReviewNext={noop} onStage={noop} onUnstage={noop} />);
assert.match(focus, /aria-label="Product intent"/); assert(focus.includes("data-shoot=\"source-description\""));
assert(focus.includes("grid-cols-1 min-[1000px]:grid-cols-")); assert(focus.includes("flex flex-wrap items-center"));
assert(focus.includes("accepted · revision 11")); assert(!focus.includes("###"));
assert.deepEqual(item, before, "presentation must not alter source or accepted data");
console.log("PASS Scope text: Markdown blocks, soft breaks, lists, safe links, inert HTML/images, excerpt disclosure, responsive focus integration, source unchanged");
