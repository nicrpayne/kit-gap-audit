// Deterministic invariants -- pure functions, NO database, NO LLM call.
// Run with: npx tsx scripts/golden-regression/deterministic.test.ts
//
// These test the guardrails in lib/audit/run.ts and the parsing in
// lib/audit/normalize.ts directly, independent of whether a real model
// call is available. See RUBRIC.md for the separate (non-deterministic)
// semantic-quality dimension.

import {
  qualifierContradiction,
  resolveBlocking,
  withinBatchDuplicateKey,
} from "@/lib/audit/run";
import { normalizeAuditOutput, type NormalizedFinding } from "@/lib/audit/normalize";
import { CALIBRATED_CANDIDATES } from "./calibratedOutput";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    pass++;
    console.log(`  ok  - ${name}`);
  } else {
    fail++;
    console.error(`FAIL  - ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function baseFinding(overrides: Partial<NormalizedFinding> = {}): NormalizedFinding {
  return {
    kind: "finding",
    type: "missing_work",
    title: "t",
    quote: "q",
    rationale: "r",
    severity: "medium",
    estimateHint: null,
    owner: null,
    blocks: null,
    blockingRequested: false,
    gate: null,
    matchedIssues: [],
    evidenceRefs: [],
    reasoningOrigin: "explicit",
    qualifiers: {
      explicitlyTicketed: false,
      explicitlyOutOfProjectScope: false,
      explicitlyDeferred: false,
      explicitlyNotReleaseBlocker: false,
    },
    reconciliation: { newObligation: true, checkedAgainst: [], matchedExistingId: null, reason: null },
    ...overrides,
  };
}

console.log("== MUST FIX 2: structured qualifiers ==");

// The task's own literal example: Tickets Created=y cannot normalize into
// "not ticketed."
check(
  "explicitlyTicketed + missing_work is suppressed",
  qualifierContradiction(
    baseFinding({ type: "missing_work", qualifiers: { ...baseFinding().qualifiers, explicitlyTicketed: true } })
  ) !== null
);

check(
  "explicitlyTicketed on a NON-missing_work candidate is NOT a contradiction (ticket existence doesn't invalidate a risk/decision)",
  qualifierContradiction(
    baseFinding({ type: "risk", qualifiers: { ...baseFinding().qualifiers, explicitlyTicketed: true } })
  ) === null
);

// "not needed for JSA" (project-scope) suppresses regardless of type.
check(
  "explicitlyOutOfProjectScope suppresses a decision candidate",
  qualifierContradiction(
    baseFinding({ type: "decision", qualifiers: { ...baseFinding().qualifiers, explicitlyOutOfProjectScope: true } })
  ) !== null
);

// "outside Beta" / "not a release blocker" (release-boundary) does NOT
// suppress the finding -- it only disqualifies blocking.
check(
  "explicitlyNotReleaseBlocker alone does not suppress the finding",
  qualifierContradiction(
    baseFinding({ qualifiers: { ...baseFinding().qualifiers, explicitlyNotReleaseBlocker: true } })
  ) === null
);
check(
  "explicitlyDeferred alone does not suppress the finding",
  qualifierContradiction(baseFinding({ qualifiers: { ...baseFinding().qualifiers, explicitlyDeferred: true } })) ===
    null
);

console.log("== MUST FIX 4: blocking bar requires gate metadata ==");

check(
  "blocking requested + no gate -> downgraded to false",
  resolveBlocking(baseFinding({ blockingRequested: true, gate: null })).blocking === false
);
check(
  "blocking requested + full gate -> survives as true",
  resolveBlocking(
    baseFinding({
      blockingRequested: true,
      gate: { releaseBoundary: "Beta", dependency: "x", evidenceForGate: "y" },
    })
  ).blocking === true
);
check(
  "blocking requested + gate present but explicitlyDeferred -> downgraded",
  resolveBlocking(
    baseFinding({
      blockingRequested: true,
      gate: { releaseBoundary: "Beta", dependency: "x", evidenceForGate: "y" },
      qualifiers: { ...baseFinding().qualifiers, explicitlyDeferred: true },
    })
  ).blocking === false
);
check(
  "blocking requested + gate present but explicitlyNotReleaseBlocker -> downgraded",
  resolveBlocking(
    baseFinding({
      blockingRequested: true,
      gate: { releaseBoundary: "Beta", dependency: "x", evidenceForGate: "y" },
      qualifiers: { ...baseFinding().qualifiers, explicitlyNotReleaseBlocker: true },
    })
  ).blocking === false
);
check(
  "blocking not requested -> stays false regardless of gate",
  resolveBlocking(baseFinding({ blockingRequested: false, gate: null })).blocking === false
);

console.log("== MUST FIX 1: reconciliation / duplication ==");

check(
  "normalizeAuditOutput defaults newObligation to false when the model omits reconciliation entirely",
  normalizeAuditOutput([
    { kind: "finding", type: "missing_work", title: "t", quote: "q", rationale: "r" },
  ]).findings[0].reconciliation.newObligation === false
);

check(
  "within-batch duplicate key matches identical type + matchedIssues set",
  withinBatchDuplicateKey(baseFinding({ type: "missing_work", matchedIssues: ["SOF-1", "SOF-2"] })) ===
    withinBatchDuplicateKey(baseFinding({ type: "missing_work", matchedIssues: ["SOF-2", "SOF-1"] }))
);
check(
  "within-batch duplicate key is null when matchedIssues is empty (no false-positive backstop)",
  withinBatchDuplicateKey(baseFinding({ matchedIssues: [] })) === null
);
check(
  "within-batch duplicate key differs across types even with the same matchedIssues",
  withinBatchDuplicateKey(baseFinding({ type: "missing_work", matchedIssues: ["SOF-1"] })) !==
    withinBatchDuplicateKey(baseFinding({ type: "risk", matchedIssues: ["SOF-1"] }))
);

console.log("== Candidate kind routing (promotion ladder) ==");

const normalized = normalizeAuditOutput(CALIBRATED_CANDIDATES);
check("11 finding-kind candidates parsed from the golden calibrated batch", normalized.findings.length === 11, String(normalized.findings.length));
check("2 signal candidates parsed", normalized.signals.length === 2, String(normalized.signals.length));
check("1 clarification candidate parsed", normalized.clarifications.length === 1, String(normalized.clarifications.length));
check(
  "a signal never has Finding-only fields leak through (no 'type' on NormalizedSignal)",
  !("type" in normalized.signals[0])
);

console.log("== Legacy/malformed input tolerance ==");
check("non-array raw output throws", (() => {
  try {
    normalizeAuditOutput({ not: "an array" });
    return false;
  } catch {
    return true;
  }
})());
check(
  "an item missing required fields is dropped, not fatal",
  normalizeAuditOutput([{ kind: "finding" }, { kind: "finding", type: "risk", title: "t", quote: "q", rationale: "r" }])
    .findings.length === 1
);
check(
  "unlabeled kind defaults to finding shape (backward compatible with v1-shaped output)",
  normalizeAuditOutput([{ type: "risk", title: "t", quote: "q", rationale: "r" }]).findings.length === 1
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
