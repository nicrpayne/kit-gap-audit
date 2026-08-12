// Replays an already-saved model-evaluation result (raw candidate JSON,
// GPT-5.6 Sol "successful" run) through the CURRENT normalization +
// deterministic guardrail pipeline -- WITHOUT touching the database.
//
// EVALUATION ONLY:
// - Does NOT import lib/prisma or lib/audit/run.ts's runAudit() (which
//   persists Findings/AuditRuns). This script re-derives the same
//   decision sequence runAudit() applies (see its inline comments) using
//   ONLY the exported pure guardrail functions -- normalizeAuditOutput,
//   qualifierContradiction, resolveBlocking, withinBatchDuplicateKey --
//   so there is no path to a database write here at all.
// - Makes NO model call. The raw candidates are read verbatim from the
//   already-saved file and never mutated.
// - Does not call persistContextSnapshot -- no ContextSnapshot is created.
//
// One assumption, stated explicitly: the citation safety net in
// runAudit() (evidenceRefs must be a subset of a real, DB-backed
// ContextSnapshot's evidence ids) is a database-existence check this
// script cannot perform without touching Prisma. Since this file
// represents an already-reviewed, already-"succeeded" evaluation run
// (see its own `status: "succeeded"`), every evidenceRefs entry cited by
// any candidate is treated as valid for this replay. This is noted here
// so the assumption is visible, not hidden.
//
// Usage: npx tsx scripts/semantic-review/replay-saved-sol.ts <path-to-saved-result.json>

import { readFileSync } from "fs";
import {
  normalizeAuditOutput,
  type NormalizedFinding,
  type NormalizedSignal,
  type NormalizedClarification,
} from "@/lib/audit/normalize";
import { qualifierContradiction, resolveBlocking, withinBatchDuplicateKey } from "@/lib/audit/run";
import { buildForecastInputs } from "@/lib/forecast/build";

interface FindingOutcome {
  candidate: NormalizedFinding;
  outcome: "persist_eligible" | "rejected" | "suppressed";
  reason: string | null;
  finalBlocking: boolean;
  blockingDowngradeReason: string | null;
}

function evaluateFindings(findings: NormalizedFinding[]): FindingOutcome[] {
  const results: FindingOutcome[] = [];
  const seenBatchKeys = new Set<string>();

  for (const f of findings) {
    // Citation safety net -- see file header: assumed satisfied for this
    // replay (already-succeeded real evaluation), not re-derived from a
    // live ContextSnapshot.

    const qualifierReason = qualifierContradiction(f);
    if (qualifierReason) {
      results.push({ candidate: f, outcome: "suppressed", reason: qualifierReason, finalBlocking: false, blockingDowngradeReason: null });
      continue;
    }

    if (!f.reconciliation.newObligation) {
      const target = f.reconciliation.matchedExistingId ? ` (matches: ${f.reconciliation.matchedExistingId})` : "";
      results.push({
        candidate: f,
        outcome: "suppressed",
        reason: `not a new underlying obligation${target}${f.reconciliation.reason ? ` -- ${f.reconciliation.reason}` : ""}`,
        finalBlocking: false,
        blockingDowngradeReason: null,
      });
      continue;
    }

    const batchKey = withinBatchDuplicateKey(f);
    if (batchKey && seenBatchKeys.has(batchKey)) {
      results.push({
        candidate: f,
        outcome: "suppressed",
        reason: `duplicates another candidate in this same audit run (same type + matched issues: ${f.matchedIssues.join(", ")})`,
        finalBlocking: false,
        blockingDowngradeReason: null,
      });
      continue;
    }
    if (batchKey) seenBatchKeys.add(batchKey);

    const { blocking, downgradeReason } = resolveBlocking(f);
    results.push({
      candidate: f,
      outcome: "persist_eligible",
      reason: null,
      finalBlocking: blocking,
      blockingDowngradeReason: f.blockingRequested && !blocking ? downgradeReason : null,
    });
  }

  return results;
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx scripts/semantic-review/replay-saved-sol.ts <path-to-saved-result.json>");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  const rawCandidates: unknown[] = raw.rawCandidates ?? raw.response?.raw;
  if (!Array.isArray(rawCandidates)) {
    console.error("Could not find rawCandidates / response.raw array in the given file.");
    process.exit(1);
  }

  console.log(`Loaded ${rawCandidates.length} raw candidates from ${filePath}`);
  console.log(`Saved model config: ${JSON.stringify(raw.response?.configuration ?? {})}\n`);

  const normalized = normalizeAuditOutput(rawCandidates);
  const findingOutcomes = evaluateFindings(normalized.findings);

  console.log("=== FINDINGS ===");
  for (const r of findingOutcomes) {
    console.log(`\n- "${r.candidate.title}" [${r.candidate.type}]`);
    console.log(`  reasoningOrigin: ${r.candidate.reasoningOrigin}`);
    console.log(`  evidenceRefs: ${JSON.stringify(r.candidate.evidenceRefs)}`);
    console.log(
      `  reconciliation: newObligation=${r.candidate.reconciliation.newObligation} matchedExistingId=${JSON.stringify(r.candidate.reconciliation.matchedExistingId)}`
    );
    console.log(`  qualifiers: ${JSON.stringify(r.candidate.qualifiers)}`);
    console.log(`  blockingRequested: ${r.candidate.blockingRequested}  gate: ${JSON.stringify(r.candidate.gate)}`);
    console.log(`  => outcome: ${r.outcome}${r.reason ? ` (${r.reason})` : ""}`);
    console.log(`  => finalBlocking: ${r.finalBlocking}${r.blockingDowngradeReason ? ` (downgrade reason: ${r.blockingDowngradeReason})` : ""}`);
  }

  console.log("\n=== SIGNALS ===");
  for (const s of normalized.signals as NormalizedSignal[]) {
    console.log(`- "${s.title}" [${s.category}] (never enters Finding table)`);
  }

  console.log("\n=== CLARIFICATIONS ===");
  for (const c of normalized.clarifications as NormalizedClarification[]) {
    console.log(`- "${c.title}" (never enters Finding table)`);
  }

  const persistEligible = findingOutcomes.filter((r) => r.outcome === "persist_eligible");
  const suppressed = findingOutcomes.filter((r) => r.outcome === "suppressed");
  const totals = {
    candidateFindings: normalized.findings.length,
    persistEligibleFindings: persistEligible.length,
    signals: normalized.signals.length,
    clarifications: normalized.clarifications.length,
    suppressed: suppressed.length,
    proposedBlockers: normalized.findings.filter((f) => f.blockingRequested).length,
    finalBlockers: persistEligible.filter((r) => r.finalBlocking).length,
  };
  console.log("\n=== TOTALS ===");
  console.log(JSON.stringify(totals, null, 2));

  const persistedFindings = persistEligible.map((result, index) => ({
    id: `replay-finding-${index + 1}`,
    type: result.candidate.type,
    title: result.candidate.title,
    status: "open",
    blocking: result.finalBlocking,
    estimateHint: result.candidate.estimateHint,
    gate: result.candidate.gate,
  }));
  const currentForecast = buildForecastInputs([], persistedFindings, 1);
  const currentItemIds = new Set(currentForecast.items.map((item) => item.id));
  const currentGates = new Map(currentForecast.gates.map((gate) => [gate.id, gate]));

  console.log("\n=== FORECAST HANDOFF: BEFORE / AFTER ===");
  for (const finding of persistedFindings) {
    const legacyPlaceholderWork = finding.type !== "decision";
    const legacyDecisionGate = finding.type === "decision" && finding.blocking;
    const currentGate = currentGates.get(finding.id);
    console.log(`\n- "${finding.title}" [${finding.type}]`);
    console.log(`  finalBlocking: ${finding.blocking}`);
    console.log(`  persistedGate: ${JSON.stringify(finding.gate)}`);
    console.log(`  BEFORE: placeholderWork=${legacyPlaceholderWork} decisionGate=${legacyDecisionGate}`);
    console.log(
      `  AFTER: workItem=${currentItemIds.has(finding.id)} serialGate=${Boolean(currentGate)} representation=${currentGate ? JSON.stringify(currentGate) : "none"}`
    );
    console.log(
      `  why: ${currentGate ? "final blocking survived with complete persisted boundary/dependency/evidence; represented once as a serial gate" : currentItemIds.has(finding.id) ? "open non-decision conclusion without a proven serial gate remains work" : "no forecast Reality effect"}`
    );
  }
}

main();
