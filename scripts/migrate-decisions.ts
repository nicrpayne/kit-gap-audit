// LEGACY DECISION FINDINGS -> FIRST-CLASS DECISIONS.
//
// A Finding is something the audit NOTICED. A Decision is something the
// project has to DECIDE. They were one row, and that overload is what let
// "this is a decision" silently mean "this delays delivery": type +
// severity + a boolean were enough to move a date, with no statement of
// what was waiting or why.
//
// THE ACCEPTANCE CRITERION IS THAT NOTHING MOVES. The calibration branch
// attempted this separation and, because nothing backfilled its new gate
// field, took the live data from three gates to zero -- every forecast
// silently jumping earlier with no visible cause. This script exists to
// make that failure impossible: it captures the gates and dates BEFORE,
// backfills, and refuses to report success unless both match after.
//
// Legacy Finding rows are never modified or deleted. They stop driving the
// forecast (lib/forecast/build.ts now takes gates from DecisionGate rows
// only), and survive as history and as the rollback path.
//
//   npx tsx scripts/migrate-decisions.ts [--apply]

import { PrismaClient } from "@prisma/client";
import { buildPortfolioInputs } from "../lib/forecast/compute";
import { runPortfolioSimulation } from "../lib/forecast/portfolio";
import { LEGACY_GATE_ESTIMATE } from "../lib/forecast/build";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const fmt = (d: Date) => d.toISOString().slice(0, 10);

// Which Scope a legacy decision Finding belongs to, by the same two
// relations lib/forecast/compute.ts uses to pull Findings into a forecast.
// A Finding reachable by neither cannot be migrated without guessing, and
// is reported rather than assigned.
async function scopeIdForFinding(f: { sourceId: string | null; contextSnapshotId: string | null }) {
  if (f.sourceId) {
    const s = await prisma.source.findUnique({ where: { id: f.sourceId }, select: { scopeId: true } });
    if (s?.scopeId) return s.scopeId;
  }
  if (f.contextSnapshotId) {
    const s = await prisma.contextSnapshot.findUnique({
      where: { id: f.contextSnapshotId },
      select: { scopeId: true },
    });
    if (s?.scopeId) return s.scopeId;
  }
  return null;
}

async function main() {
  // ── BEFORE ───────────────────────────────────────────────────────────
  const legacy = await prisma.finding.findMany({
    where: { type: "decision" },
    select: {
      id: true, title: true, status: true, blocking: true, owner: true, blocks: true,
      quote: true, rationale: true, resolution: true, resolvedAt: true, createdAt: true,
      sourceId: true, contextSnapshotId: true, evidenceRefs: true, matchedIssues: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const legacyGates = legacy.filter((f) => f.status === "open" && f.blocking);

  console.log("── BEFORE ────────────────────────────────────────────────────");
  console.log(`  legacy decision Findings : ${legacy.length}`);
  console.log(`  live gates (open+blocking): ${legacyGates.length}`);
  for (const g of legacyGates) console.log(`    · ${g.title.slice(0, 58)}`);

  // Forecast BEFORE, computed with the legacy rule reconstructed here --
  // build.ts no longer applies it, so it has to be stated explicitly to be
  // compared against.
  const portfolio = await buildPortfolioInputs();
  const gatesByScopeBefore = new Map<string, { id: string; label: string; low: number; likely: number; high: number }[]>();
  for (const f of legacyGates) {
    const scopeId = await scopeIdForFinding(f);
    if (!scopeId) continue;
    const list = gatesByScopeBefore.get(scopeId) ?? [];
    list.push({ id: f.id, label: f.title, ...LEGACY_GATE_ESTIMATE });
    gatesByScopeBefore.set(scopeId, list);
  }
  const specsWith = (gatesByScope: Map<string, { low: number; likely: number; high: number; id: string; label: string }[]>) =>
    portfolio.scopes.map((s) => ({
      scopeId: s.scopeId,
      items: s.items,
      gates: gatesByScope.get(s.scopeId) ?? [],
      teamCapacity: s.teamCapacity,
      dependsOnScopeIds: s.dependsOnScopeIds,
      startDate: portfolio.startDate,
      targetDate: s.targetDate,
    }));
  const before = runPortfolioSimulation(specsWith(gatesByScopeBefore));

  console.log("\n  forecast now:");
  for (const [id, r] of before) console.log(`    ${id.padEnd(10)} ${fmt(r.likelyDate)}`);

  const orphans: string[] = [];
  for (const f of legacy) if (!(await scopeIdForFinding(f))) orphans.push(f.title);
  if (orphans.length > 0) {
    console.log(`\n  NOTE: ${orphans.length} decision Finding(s) reach no Scope and cannot be migrated without guessing:`);
    for (const t of orphans) console.log(`    · ${t.slice(0, 58)}`);
  }

  if (!APPLY) {
    console.log("\n(dry run -- nothing written. Re-run with --apply.)");
    await prisma.$disconnect();
    return;
  }

  // ── APPLY ────────────────────────────────────────────────────────────
  // Idempotent throughout: Decision.sourceFindingId is unique, so a second
  // run updates rather than duplicating.
  let created = 0;
  let gatesCreated = 0;
  for (const f of legacy) {
    const scopeId = await scopeIdForFinding(f);
    if (!scopeId) continue;

    const status = f.status === "resolved" ? "decided" : f.status === "dismissed" ? "dismissed" : "open";
    const decision = await prisma.decision.upsert({
      where: { sourceFindingId: f.id },
      update: {},
      create: {
        scopeId,
        title: f.title,
        status,
        owner: f.owner,
        rationale: f.rationale,
        resolution: f.resolution,
        decidedAt: f.resolvedAt,
        relatedIssues: f.matchedIssues,
        sourceFindingId: f.id,
        createdAt: f.createdAt,
      },
    });
    created++;

    // The Finding's own quote is real cited evidence -- carry it, rather
    // than starting the new model with nothing.
    const existingEvidence = await prisma.decisionEvidence.count({ where: { decisionId: decision.id } });
    if (existingEvidence === 0 && f.quote.trim()) {
      await prisma.decisionEvidence.create({
        data: {
          decisionId: decision.id,
          kind: "finding",
          excerpt: f.quote,
          contextSnapshotId: f.contextSnapshotId,
          evidenceItemId: f.evidenceRefs[0] ?? null,
          sourceLabel: "Migrated from audit finding",
        },
      });
    }

    // Only a Finding that WAS a live gate becomes a gate, with exactly the
    // timing the old constant used. The dependency text is the legacy
    // `blocks` string where one exists -- preserved rather than invented,
    // and flagged as migrated so it is visibly weaker than an answered one.
    if (f.status === "open" && f.blocking) {
      const already = await prisma.decisionGate.findUnique({ where: { decisionId: decision.id } });
      if (!already) {
        await prisma.decisionGate.create({
          data: {
            decisionId: decision.id,
            targetScopeId: scopeId,
            dependency: f.blocks?.trim()
              ? f.blocks
              : "Migrated from a legacy blocking decision; the original record did not say what was waiting.",
            evidenceForGate: f.quote.trim() || "Migrated from a legacy blocking decision with no cited evidence.",
            ...LEGACY_GATE_ESTIMATE,
            serial: true,
            provenance: "migrated",
          },
        });
        gatesCreated++;
      }
    }
  }
  console.log(`\napplied: ${created} Decision(s), ${gatesCreated} gate(s)`);

  // ── PROVE NOTHING MOVED ──────────────────────────────────────────────
  const afterGates = await prisma.decisionGate.findMany({
    where: { serial: true, decision: { status: "open" } },
    select: { id: true, low: true, likely: true, high: true, targetScopeId: true, decision: { select: { title: true } } },
  });
  const gatesByScopeAfter = new Map<string, { id: string; label: string; low: number; likely: number; high: number }[]>();
  for (const g of afterGates) {
    const list = gatesByScopeAfter.get(g.targetScopeId) ?? [];
    list.push({ id: g.id, label: g.decision.title, low: g.low, likely: g.likely, high: g.high });
    gatesByScopeAfter.set(g.targetScopeId, list);
  }
  const after = runPortfolioSimulation(specsWith(gatesByScopeAfter));

  console.log("\n── EQUIVALENCE ───────────────────────────────────────────────");
  console.log(`  gates before ${legacyGates.length}  ->  after ${afterGates.length}`);
  let bad = legacyGates.length === afterGates.length ? 0 : 1;
  const timingOk = afterGates.every((g) => g.low === 1 && g.likely === 4 && g.high === 10);
  if (!timingOk) bad++;
  console.log(`  timing preserved at 1/4/10: ${timingOk ? "yes" : "NO"}`);

  console.log("  SCOPE        date before   after      OK");
  for (const s of portfolio.scopes) {
    const b = before.get(s.scopeId);
    const a = after.get(s.scopeId);
    const ok = !!b && !!a && fmt(b.likelyDate) === fmt(a.likelyDate);
    if (!ok) bad++;
    console.log(`  ${s.name.padEnd(12)} ${b ? fmt(b.likelyDate) : "—"}    ${a ? fmt(a.likelyDate) : "—"}   ${ok ? "yes" : "NO"}`);
  }

  console.log(
    bad === 0
      ? "\nMIGRATION PRESERVED EVERY GATE AND EVERY DATE"
      : `\n${bad} DISCREPANCY(IES) — INVESTIGATE BEFORE PROCEEDING`
  );
  await prisma.$disconnect();
  process.exit(bad === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
