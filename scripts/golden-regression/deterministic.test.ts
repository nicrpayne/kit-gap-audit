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
import { buildForecastInputs, type FindingLike } from "@/lib/forecast/build";
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
      appliesToBoundary: null,
    },
    reconciliation: { newObligation: true, checkedAgainst: [], matchedExistingId: null, reason: null },
    ...overrides,
  };
}

const COMPLETE_FORECAST_GATE = {
  releaseBoundary: "Production",
  dependency: "The dependency must complete before this boundary can ship.",
  evidenceForGate: "Direct evidence establishes the serial dependency.",
};

function forecastFinding(overrides: Partial<FindingLike> = {}): FindingLike {
  return {
    id: "finding-1",
    type: "risk",
    title: "Forecast finding",
    status: "open",
    blocking: false,
    estimateHint: null,
    gate: null,
    ...overrides,
  };
}

function forecastFor(...findings: FindingLike[]) {
  return buildForecastInputs([], findings, 1);
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
  "blocking requested + gate present + explicitlyDeferred for the SAME boundary -> downgraded",
  resolveBlocking(
    baseFinding({
      blockingRequested: true,
      gate: { releaseBoundary: "Milestone A", dependency: "x", evidenceForGate: "y" },
      qualifiers: { ...baseFinding().qualifiers, explicitlyDeferred: true, appliesToBoundary: "Milestone A" },
    })
  ).blocking === false
);
check(
  "blocking requested + gate present + explicitlyNotReleaseBlocker for the SAME boundary -> downgraded",
  resolveBlocking(
    baseFinding({
      blockingRequested: true,
      gate: { releaseBoundary: "Milestone A", dependency: "x", evidenceForGate: "y" },
      qualifiers: { ...baseFinding().qualifiers, explicitlyNotReleaseBlocker: true, appliesToBoundary: "Milestone A" },
    })
  ).blocking === false
);
check(
  "blocking not requested -> stays false regardless of gate",
  resolveBlocking(baseFinding({ blockingRequested: false, gate: null })).blocking === false
);

console.log("== Release-boundary qualifier coherence (semantic-review calibration fix) ==");

// CASE A -- same-boundary non-blocker suppresses the gate.
check(
  "CASE A: same-boundary explicitlyNotReleaseBlocker suppresses an otherwise-complete gate",
  resolveBlocking(
    baseFinding({
      blockingRequested: true,
      gate: { releaseBoundary: "Pilot", dependency: "offline sync", evidenceForGate: "e" },
      qualifiers: { ...baseFinding().qualifiers, explicitlyNotReleaseBlocker: true, appliesToBoundary: "Pilot" },
    })
  ).blocking === false
);

// CASE B -- different-boundary non-blocker must NOT suppress the gate.
// This is Candidate 1's exact shape, generalized: a real gate against one
// boundary, plus a disclaiming qualifier scoped to a narrower, different
// boundary. The disclaimer is true and real -- it just doesn't apply here.
check(
  "CASE B: different-boundary explicitlyNotReleaseBlocker does NOT suppress the gate",
  resolveBlocking(
    baseFinding({
      blockingRequested: true,
      gate: { releaseBoundary: "GA", dependency: "joint readiness", evidenceForGate: "e" },
      qualifiers: { ...baseFinding().qualifiers, explicitlyNotReleaseBlocker: true, appliesToBoundary: "Pilot" },
    })
  ).blocking === true
);

// CASE C -- same-boundary deferred suppresses the gate (mirror of A for
// the other disqualifying qualifier).
check(
  "CASE C: same-boundary explicitlyDeferred suppresses an otherwise-complete gate",
  resolveBlocking(
    baseFinding({
      blockingRequested: true,
      gate: { releaseBoundary: "GA", dependency: "migration", evidenceForGate: "e" },
      qualifiers: { ...baseFinding().qualifiers, explicitlyDeferred: true, appliesToBoundary: "GA" },
    })
  ).blocking === false
);

// CASE D -- ambiguous/no-boundary evidence (no gate at all) cannot
// produce blocking, regardless of any qualifier.
check(
  "CASE D: no gate at all -> never blocking, no matter what qualifiers say",
  resolveBlocking(
    baseFinding({
      blockingRequested: true,
      gate: null,
      qualifiers: { ...baseFinding().qualifiers, explicitlyNotReleaseBlocker: false },
    })
  ).blocking === false
);

// CASE E -- explicit same-boundary serial gate, no disqualifying
// qualifier at all, survives.
check(
  "CASE E: complete gate, no disqualifying qualifier -> survives as blocking",
  resolveBlocking(
    baseFinding({
      blockingRequested: true,
      gate: { releaseBoundary: "GA", dependency: "x", evidenceForGate: "y" },
    })
  ).blocking === true
);

// Unscoped (appliesToBoundary omitted/null) qualifier does NOT override a
// complete, specific gate -- this is the exact shape legacy/pre-fix saved
// model output has (no boundary field existed yet), and the shape a
// model that skips the (still-optional-when-false) field will produce.
check(
  "Unscoped explicitlyNotReleaseBlocker (appliesToBoundary null) does not cancel a complete gate",
  resolveBlocking(
    baseFinding({
      blockingRequested: true,
      gate: { releaseBoundary: "GA", dependency: "x", evidenceForGate: "y" },
      qualifiers: { ...baseFinding().qualifiers, explicitlyNotReleaseBlocker: true, appliesToBoundary: null },
    })
  ).blocking === true
);

// Boundary comparison is normalized (case/whitespace), not a literal
// string match -- and works for arbitrary project-specific boundary
// vocabulary (internal test / pilot / Beta / GA / production / customer
// rollout / Phase 1 / milestone X, ...), not just two hardcoded values.
check(
  "boundary comparison is case/whitespace-normalized",
  resolveBlocking(
    baseFinding({
      blockingRequested: true,
      gate: { releaseBoundary: "  Customer Rollout  ", dependency: "x", evidenceForGate: "y" },
      qualifiers: { ...baseFinding().qualifiers, explicitlyDeferred: true, appliesToBoundary: "customer rollout" },
    })
  ).blocking === false
);
check(
  "boundary comparison generalizes to arbitrary project vocabulary (Phase 1 vs Milestone X)",
  resolveBlocking(
    baseFinding({
      blockingRequested: true,
      gate: { releaseBoundary: "Phase 1", dependency: "x", evidenceForGate: "y" },
      qualifiers: { ...baseFinding().qualifiers, explicitlyDeferred: true, appliesToBoundary: "Milestone X" },
    })
  ).blocking === true
);

// The literal reproduction of the semantic-review Candidate 1 shape:
// production gate + a Beta-scoped non-blocker qualifier. Must survive.
check(
  "Candidate 1 shape: production gate + Beta-scoped non-blocker survives as blocking",
  resolveBlocking(
    baseFinding({
      type: "risk",
      title: "JSA production is serially coupled to iTrack readiness",
      blockingRequested: true,
      gate: {
        releaseBoundary: "2026-10-31 production release",
        dependency: "iTrack must be ready for the same production launch before JSA can ship.",
        evidenceForGate: "Lucas stated the release will contain JSA and iTrack together.",
      },
      qualifiers: { ...baseFinding().qualifiers, explicitlyNotReleaseBlocker: true, appliesToBoundary: "Beta" },
    })
  ).blocking === true
);

console.log("== Finding type vs. serial forecast gate ==");

const pureReleaseDependency = forecastFor(
  forecastFinding({
    type: "risk",
    title: "Production cannot ship until external approval",
    blocking: true,
    gate: COMPLETE_FORECAST_GATE,
  })
);
check(
  "A: pure release dependency -> one serial gate and no placeholder work",
  pureReleaseDependency.gates.length === 1 && pureReleaseDependency.items.length === 0 &&
    pureReleaseDependency.gates[0].sourceFindingType === "risk"
);

const nonBlockingMissingWork = forecastFor(
  forecastFinding({
    type: "missing_work",
    title: "Cutover plan has not been created",
    blocking: false,
    gate: null,
  })
);
check(
  "B: non-blocking missing work -> work, no gate",
  nonBlockingMissingWork.items.length === 1 && nonBlockingMissingWork.gates.length === 0
);

const blockingMissingWork = forecastFor(
  forecastFinding({ type: "missing_work", blocking: true, gate: COMPLETE_FORECAST_GATE })
);
check(
  "C: missing work + proven serial dependency -> gate only, without duplicate work",
  blockingMissingWork.gates.length === 1 && blockingMissingWork.items.length === 0
);

const blockingDecision = forecastFor(
  forecastFinding({ type: "decision", blocking: true, gate: COMPLETE_FORECAST_GATE })
);
check(
  "D: blocking decision + complete gate -> serial gate",
  blockingDecision.gates.length === 1 && blockingDecision.items.length === 0
);

const seriousRiskWithoutGate = forecastFor(
  forecastFinding({ type: "risk", blocking: true, gate: null })
);
check(
  "E: serious risk without serial dependency -> no gate",
  seriousRiskWithoutGate.gates.length === 0 && seriousRiskWithoutGate.items.length === 1
);

const incompleteGate = forecastFor(
  forecastFinding({
    type: "risk",
    blocking: true,
    gate: { releaseBoundary: "Production", dependency: "Dependency", evidenceForGate: "" },
  })
);
check("incomplete persisted gate metadata -> no gate", incompleteGate.gates.length === 0);

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
check(
  "H: signals and clarifications never enter forecast Reality",
  forecastFor().items.length === 0 && forecastFor().gates.length === 0 &&
    normalized.signals.length === 2 && normalized.clarifications.length === 1
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
