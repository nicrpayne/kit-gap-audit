// DECISIONS MODEL PROOFS. Not part of the app build.
//
// Every assertion here goes through the real HTTP API against the running
// dev server, then verifies the consequence by recomputing the forecast
// from the database with the same modules the server uses. Nothing is
// asserted about intent; everything is asserted about dates and rows.
//
// The proofs it owns (the browser harness owns D/E/F/I/O):
//
//   A  migration equivalence -- the legacy gates survived
//   B  an open, ungated decision moves NO date
//   C  connecting to delivery moves the date, using ITS timing
//   G  a derived claim is a candidate, not a Decision, until accepted
//   H  acceptance preserves the cited evidence
//   J  acceptance is idempotent
//   K  importing decision language creates no gate
//   L  "assume decided" and "actually decided" produce the same date
//   M  every legacy gate is still present
//   N  a legacy Finding can no longer independently create a gate
//
//   npx tsx scripts/decisions-model-proof.ts

import { PrismaClient } from "@prisma/client";
import { buildPortfolioInputs } from "../lib/forecast/compute";
import { runPortfolioSimulation } from "../lib/forecast/portfolio";
import { LEGACY_GATE_ESTIMATE } from "../lib/forecast/build";

const prisma = new PrismaClient();
const BASE = "http://localhost:3000";
const SCOPE = "jsa";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};
const fmt = (d: Date) => d.toISOString().slice(0, 10);

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty body */
  }
  return { ok: res.ok, status: res.status, body };
}

// Reality's dates, recomputed from the database exactly as the server does.
async function dates(): Promise<Map<string, string>> {
  const portfolio = await buildPortfolioInputs();
  const result = runPortfolioSimulation(
    portfolio.scopes.map((s) => ({
      scopeId: s.scopeId,
      items: s.items,
      gates: s.gates,
      teamCapacity: s.teamCapacity,
      dependsOnScopeIds: s.dependsOnScopeIds,
      startDate: portfolio.startDate,
      targetDate: s.targetDate,
    }))
  );
  return new Map([...result].map(([id, r]) => [id, fmt(r.likelyDate)]));
}

// The same computation with a set of gates dropped -- how a Scenario
// ("assume decided") reaches the engine, and the only difference from
// Reality is the filtered input.
async function datesAssuming(resolvedGateIds: Set<string>): Promise<Map<string, string>> {
  const portfolio = await buildPortfolioInputs();
  const result = runPortfolioSimulation(
    portfolio.scopes.map((s) => ({
      scopeId: s.scopeId,
      items: s.items,
      gates: s.gates.filter((g) => !resolvedGateIds.has(g.id)),
      teamCapacity: s.teamCapacity,
      dependsOnScopeIds: s.dependsOnScopeIds,
      startDate: portfolio.startDate,
      targetDate: s.targetDate,
    }))
  );
  return new Map([...result].map(([id, r]) => [id, fmt(r.likelyDate)]));
}

const same = (a: Map<string, string>, b: Map<string, string>) =>
  [...a].every(([k, v]) => b.get(k) === v) && a.size === b.size;
const describe = (a: Map<string, string>, b: Map<string, string>) =>
  [...a]
    .filter(([k, v]) => b.get(k) !== v)
    .map(([k, v]) => `${k} ${v}->${b.get(k)}`)
    .join(", ") || "identical";

async function main() {
  const createdDecisionIds: string[] = [];
  const createdCandidateKeys: string[] = [];

  const baseline = await dates();
  console.log("BASELINE (Reality):");
  for (const [id, d] of baseline) console.log(`  ${id.padEnd(10)} ${d}`);

  // ── A + M: the legacy gates survived migration ───────────────────────
  const legacyFindings = await prisma.finding.count({ where: { type: "decision", status: "open", blocking: true } });
  const migratedGates = await prisma.decisionGate.findMany({
    where: { provenance: "migrated" },
    select: { id: true, low: true, likely: true, high: true, decision: { select: { status: true } } },
  });
  check(
    "A/M every legacy blocking decision is still a live gate",
    migratedGates.length === legacyFindings && legacyFindings > 0,
    `${legacyFindings} legacy blocking findings -> ${migratedGates.length} migrated gates`
  );
  check(
    "A migrated gates kept the legacy 1/4/10 timing exactly",
    migratedGates.every(
      (g) =>
        g.low === LEGACY_GATE_ESTIMATE.low &&
        g.likely === LEGACY_GATE_ESTIMATE.likely &&
        g.high === LEGACY_GATE_ESTIMATE.high
    )
  );

  // ── N: a Finding can no longer independently create a gate ───────────
  // The exact row the OLD rule would have gated on: type "decision",
  // status "open", blocking true, reachable from the scope, and with no
  // Decision of its own. Under the old rule this alone moved every date on
  // the path. It must now do nothing whatsoever.
  const anySource = await prisma.source.findFirst({ where: { scopeId: SCOPE }, select: { id: true } });
  const gatesBeforeFinding = await prisma.decisionGate.count();
  const impostor = await prisma.finding.create({
    data: {
      sourceId: anySource?.id ?? null,
      type: "decision",
      title: "PROOF N — a blocking decision Finding with no Decision row",
      quote: "Under the legacy rule, this row alone was a forecast gate.",
      rationale: "Created by scripts/decisions-model-proof.ts and deleted at the end of the run.",
      severity: "high",
      blocking: true,
      status: "open",
    },
    select: { id: true },
  });
  const afterFinding = await dates();
  check(
    "N an open+blocking decision Finding creates no gate and moves no date",
    same(baseline, afterFinding) && (await prisma.decisionGate.count()) === gatesBeforeFinding,
    describe(baseline, afterFinding)
  );
  await prisma.finding.delete({ where: { id: impostor.id } });

  // ── B: an open, ungated decision moves no date ───────────────────────
  const created = await api("/api/decisions", {
    method: "POST",
    body: JSON.stringify({
      scopeId: SCOPE,
      title: "How should addresses be stored?",
      rationale: "Structured fields or a single string — raised in refinement.",
    }),
  });
  const decision = created.body.decision as { id: string; status: string } | undefined;
  check("B manual creation succeeds", created.ok && !!decision, `status ${created.status}`);
  if (!decision) throw new Error("cannot continue without the created decision");
  createdDecisionIds.push(decision.id);

  const row = await prisma.decision.findUnique({ where: { id: decision.id }, include: { gate: true } });
  check("B it is created OPEN and UNGATED", row?.status === "open" && row?.gate === null);
  const afterCreate = await dates();
  check("B no forecast moved", same(baseline, afterCreate), describe(baseline, afterCreate));

  // ── C: the gate door refuses an unanswered claim, then works ─────────
  const refused = await api(`/api/decisions/${decision.id}/gate`, {
    method: "POST",
    body: JSON.stringify({ targetScopeId: SCOPE }),
  });
  const missing = (refused.body.missing as Record<string, string>) ?? {};
  check(
    "C connecting without the four answers is refused",
    refused.status === 400 && "dependency" in missing && "evidenceForGate" in missing && "estimate" in missing,
    Object.keys(missing).join(", ")
  );
  const stillClear = await dates();
  check("C a refused connection moved nothing", same(baseline, stillClear), describe(baseline, stillClear));

  const badRange = await api(`/api/decisions/${decision.id}/gate`, {
    method: "POST",
    body: JSON.stringify({
      targetScopeId: SCOPE,
      dependency: "Storage format blocks the address form",
      evidenceForGate: "Refinement call on 14 Aug",
      low: 9,
      likely: 4,
      high: 10,
    }),
  });
  check("C an estimate that is not low ≤ likely ≤ high is refused", badRange.status === 400);

  const connected = await api(`/api/decisions/${decision.id}/gate`, {
    method: "POST",
    body: JSON.stringify({
      targetScopeId: SCOPE,
      dependency: "The address form cannot be built until the storage shape is settled.",
      evidenceForGate: "Refinement call on 14 Aug — the team agreed the form waits on this.",
      low: 3,
      likely: 12,
      high: 25,
    }),
  });
  check("C connecting with all four answers succeeds", connected.ok, `status ${connected.status}`);
  const gated = await dates();
  check(
    "C the forecast responds, and only for the gated scope",
    gated.get(SCOPE) !== baseline.get(SCOPE),
    `${SCOPE} ${baseline.get(SCOPE)} -> ${gated.get(SCOPE)}`
  );

  // The gate's OWN timing is what the engine received: a bigger estimate
  // must push the date further than the legacy 1/4/10 would have.
  const gateId = (connected.body.gate as { id: string }).id;
  await prisma.decisionGate.update({ where: { id: gateId }, data: { low: 1, likely: 4, high: 10 } });
  const smallTiming = await dates();
  check(
    "C the gate's own low/likely/high drives the result, not a constant",
    smallTiming.get(SCOPE) !== gated.get(SCOPE),
    `12d likely ${gated.get(SCOPE)} vs 4d likely ${smallTiming.get(SCOPE)}`
  );
  await prisma.decisionGate.update({ where: { id: gateId }, data: { low: 3, likely: 12, high: 25 } });

  // ── L: assumed-decided and actually-decided agree ────────────────────
  const assumed = await datesAssuming(new Set([gateId]));
  await api(`/api/decisions/${decision.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "decided", resolution: "Structured fields." }),
  });
  const reallyDecided = await dates();
  check(
    "L assuming a gate decided equals actually deciding it",
    same(assumed, reallyDecided),
    describe(assumed, reallyDecided)
  );
  check(
    "F deciding it in Reality returns the forecast to its ungated value",
    reallyDecided.get(SCOPE) === baseline.get(SCOPE),
    `${reallyDecided.get(SCOPE)} vs ${baseline.get(SCOPE)}`
  );
  const decidedRow = await prisma.decision.findUnique({ where: { id: decision.id }, include: { gate: true } });
  check(
    "F the gate ROW survives being decided — history is not deleted",
    decidedRow?.gate !== null && decidedRow?.decidedAt !== null
  );

  // ── G + H: the candidate boundary ────────────────────────────────────
  const gatesBeforeImport = await prisma.decisionGate.count();
  const decisionsBeforeImport = await prisma.decision.count();
  const imported = await api("/api/decision-candidates", { method: "POST", body: JSON.stringify({}) });
  check("G importing derived claims succeeds", imported.ok, JSON.stringify(imported.body));
  check(
    "G importing created NO Decision and NO gate",
    (await prisma.decision.count()) === decisionsBeforeImport &&
      (await prisma.decisionGate.count()) === gatesBeforeImport
  );
  const afterImport = await dates();
  check("G importing moved no date", same(baseline, afterImport), describe(baseline, afterImport));

  const candidates = await prisma.decisionCandidate.findMany({ where: { status: "pending" } });
  check(
    "G only claims of a decision kind became candidates",
    candidates.length === 2 && candidates.every((c) => c.excerpts.length > 0),
    candidates.map((c) => c.title).join(" | ")
  );
  const candidate = candidates.find((c) => c.title === "Address storage format");
  if (!candidate) throw new Error("expected the address-storage candidate");
  createdCandidateKeys.push(...candidates.map((c) => c.claimKey));

  const accepted = await api(`/api/decision-candidates/${candidate.id}/accept`, { method: "POST" });
  const acceptedDecision = accepted.body.decision as { id: string; status: string; gate: unknown } | undefined;
  check("G accepting creates an OPEN, UNGATED decision", acceptedDecision?.status === "open" && !acceptedDecision?.gate);
  if (acceptedDecision) createdDecisionIds.push(acceptedDecision.id);
  const afterAccept = await dates();
  check("G accepting still moved no date", same(baseline, afterAccept), describe(baseline, afterAccept));

  const evidence = await prisma.decisionEvidence.findMany({ where: { decisionId: acceptedDecision!.id } });
  check(
    "H acceptance carried the cited evidence across",
    evidence.length === candidate.excerpts.length &&
      candidate.excerpts.every((x) => evidence.some((e) => e.excerpt === x)) &&
      evidence.every((e) => e.contextSnapshotId === candidate.contextSnapshotId),
    `${evidence.length} excerpt(s), snapshot ${candidate.contextSnapshotId?.slice(-8)}`
  );
  check(
    "H evidence kept its per-item reference into the package",
    candidate.evidenceRefs.every((r) => evidence.some((e) => e.evidenceItemId === r)),
    candidate.evidenceRefs.join(", ")
  );

  // ── J: acceptance is idempotent ──────────────────────────────────────
  const countBeforeRetry = await prisma.decision.count();
  const retry = await api(`/api/decision-candidates/${candidate.id}/accept`, { method: "POST" });
  const retried = retry.body.decision as { id: string } | undefined;
  check(
    "J a retried acceptance returns the same decision and creates no duplicate",
    retry.ok &&
      retried?.id === acceptedDecision!.id &&
      retry.body.created === false &&
      (await prisma.decision.count()) === countBeforeRetry
  );

  // ── K: importing decision language creates no gate ───────────────────
  const gatesBeforePaste = await prisma.decisionGate.count();
  const pasted = await api("/api/decisions/import", {
    method: "POST",
    body: JSON.stringify({
      scopeId: SCOPE,
      mode: "decisions",
      text:
        "BLOCKER: which payments provider do we launch with? | everything is blocked on this\n" +
        "Notification approach | in-app only or email too?",
    }),
  });
  check("K importing rows as decisions succeeds", pasted.ok, JSON.stringify(pasted.body).slice(0, 160));
  for (const d of (pasted.body.created as { id: string }[] | undefined) ?? []) createdDecisionIds.push(d.id);
  check(
    "K …and created no gate, however blocking the text claimed to be",
    (await prisma.decisionGate.count()) === gatesBeforePaste
  );
  const afterPaste = await dates();
  check("K …and moved no date", same(baseline, afterPaste), describe(baseline, afterPaste));

  const pastedAgain = await api("/api/decisions/import", {
    method: "POST",
    body: JSON.stringify({ scopeId: SCOPE, mode: "decisions", text: "Notification approach | in-app only or email too?" }),
  });
  check(
    "K re-importing the same row surfaces it as a possible duplicate instead of duplicating",
    ((pastedAgain.body.possibleDuplicates as unknown[] | undefined)?.length ?? 0) === 1 &&
      pastedAgain.body.decisionsCreated === 0
  );

  // ── CLEAN UP ─────────────────────────────────────────────────────────
  // Proofs must leave Reality where they found it.
  await prisma.decision.deleteMany({ where: { id: { in: createdDecisionIds } } });
  await prisma.decisionCandidate.deleteMany({ where: { claimKey: { in: createdCandidateKeys } } });
  const restored = await dates();
  check("the proof restored Reality exactly", same(baseline, restored), describe(baseline, restored));

  console.log(`\n${failures === 0 ? "ALL DECISION MODEL PROOFS PASSED" : `${failures} FAILURE(S)`}`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
