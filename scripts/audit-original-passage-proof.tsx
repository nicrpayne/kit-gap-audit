import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { passageIdentity, projectPassageReceipt } from "../lib/audit/passageReceipt";
import AuditOriginalPassage from "../components/audit/AuditOriginalPassage";
const nodeId = "passage:original:hermes-ev:quote-1";
const quote = 'Agreed original statement. <script>notExecutable()</script>';
const pkg = {
  version: "1.1", packageId: "original", producer: "manual", scopeId: "qa", generatedAt: "2026-10-08T10:00:00Z",
  sources: [{ sourceRef: "fixture://original-conversation", sourceType: "transcript", registrationId: null, role: "raw_evidence", status: "active", observedAt: "2026-10-08T10:00:00Z", succeeded: true, detail: null }],
  evidence: [{ id: "hermes-ev:quote-1", sourceRef: "fixture://original-conversation", kind: "transcript", excerpt: quote, data: { source_date: "2026-09-10", char_start: 4, char_end: 24, offset_unit: "unicode_code_points" }, passageHash: "original-hash" }],
  completeness: { expectedSources: [], missingSources: [], excludedSources: [] }, warnings: [],
};
const snapshot = { id: "original", scopeId: "qa", createdAt: "2026-10-08T12:00:00Z", package: pkg };
assert.deepEqual(passageIdentity(nodeId), { snapshotId: "original", evidenceId: "hermes-ev:quote-1" });
assert.equal(passageIdentity("finding:something"), null);
const receipt = projectPassageReceipt("qa", nodeId, snapshot)!;
assert.equal(receipt.passage?.quote, quote);
assert.equal(receipt.passage?.sourceDate, "2026-09-10");
assert.equal(receipt.passage?.snapshotRecordedAt, snapshot.createdAt);
assert.deepEqual(receipt.passage?.locator, { quoteHash: "original-hash", charStart: 4, charEnd: 24, offsetUnit: "unicode_code_points" });
for (const invalid of [null, { ...snapshot, id: "newer" }, { ...snapshot, scopeId: "other" }, { ...snapshot, package: { ...pkg, scopeId: "other" } }, { ...snapshot, package: {} }]) {
  assert.equal(projectPassageReceipt("qa", nodeId, invalid)?.passage, null, "foreign/missing/wrong snapshot never substitutes the newest quote");
}
assert.equal(projectPassageReceipt("qa", "passage:original:missing", snapshot)?.passage, null);
const html = renderToStaticMarkup(<AuditOriginalPassage receipt={receipt} onClose={() => {}} />);
assert(html.includes('aria-labelledby="original-passage-title"'));
assert(html.includes("Historical snapshot"));
assert(html.includes("&lt;script&gt;") && !html.includes("<script>"));
assert(html.includes("original-hash") && html.includes("2026-09-10"));
assert(html.includes("full conversation is not attached"));
const unavailable = renderToStaticMarkup(<AuditOriginalPassage receipt={{ ...receipt, passage: null }} onClose={() => {}} />);
assert(unavailable.includes("No current quote has been substituted"));
console.log("PASS original Audit passage: immutable identity, scoped/missing origins, dates/locator, honest unavailable/full-conversation limits and inert accessible dialog markup");
