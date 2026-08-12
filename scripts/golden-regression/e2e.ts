// End-to-end golden regression: runs the REAL runAudit() pipeline
// (Prisma persistence, citation safety net, reconciliation/qualifier/
// blocking guardrails, origin-tag rationale prefixing) against a real
// local Postgres database, with ONLY the model call itself
// (AuditRunOptions.complete) swapped for the hand-authored
// CALIBRATED_CANDIDATES batch (see calibratedOutput.ts for why: no
// ANTHROPIC_API_KEY in this sandbox). Everything else -- Scope, existing
// Findings, the persisted ContextSnapshot, the evidence-citation safety
// net, the Prisma writes -- is real.
//
// Run with: npx tsx scripts/golden-regression/e2e.ts
// Requires local Postgres up and DATABASE_URL set (see .env / HANDOFF.md
// "Testing discipline"). Creates and deletes its own Scope; safe to
// re-run.

import { prisma } from "@/lib/prisma";
import { runAudit } from "@/lib/audit/run";
import { persistContextSnapshot } from "@/lib/context/snapshot";
import { buildGoldenPackage, EXISTING_FINDINGS_SEED } from "./fixture";
import { CALIBRATED_CANDIDATES } from "./calibratedOutput";
import { buildForecastInputs } from "@/lib/forecast/build";

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

async function main() {
  const scope = await prisma.scope.create({
    data: { name: "Golden Regression JSA", teamKey: "SOF-GOLDEN-REGRESSION" },
  });

  try {
    const priorSource = await prisma.source.create({
      data: { kind: "notes", title: "Pre-existing findings (golden fixture)", content: "seed", scopeId: scope.id },
    });
    for (const f of EXISTING_FINDINGS_SEED) {
      await prisma.finding.create({
        data: {
          sourceId: priorSource.id,
          type: f.type,
          title: f.title,
          quote: f.quote,
          rationale: f.rationale,
          severity: f.severity,
          blocking: f.blocking,
          matchedIssues: [...f.matchedIssues],
        },
      });
    }

    const rawPackage = buildGoldenPackage(scope.id);
    const snapshot = await persistContextSnapshot(rawPackage, { expectedScopeId: scope.id });
    check("package accepted, 19 evidence items persisted", snapshot.package.evidence.length === 19, String(snapshot.package.evidence.length));

    let callCount = 0;
    const mockComplete = async () => {
      callCount++;
      return CALIBRATED_CANDIDATES;
    };

    const result = await runAudit(
      scope,
      undefined,
      {
        packageContext: { contextSnapshotId: snapshot.id, evidence: snapshot.package.evidence, sources: snapshot.package.sources },
        complete: mockComplete as never,
      }
    );

    check("model called exactly once", callCount === 1);
    check("no rejectedFindings (every candidate cited valid evidence)", result.rejectedFindings.length === 0, JSON.stringify(result.rejectedFindings));

    // -- Persisted findings --
    const titles = result.findings.map((f) => f.title).sort();
    console.log("\nPersisted Findings:", titles);
    check("exactly 5 new Findings persisted", result.findings.length === 5, String(result.findings.length));
    check(
      "Finding 5 (approval-permission conflict) persisted",
      titles.includes("Approval-permission model conflicts with pending-filter design")
    );
    check("Finding 6 (cutover owner) persisted", titles.includes("Migration cutover night owner unassigned"));
    check("Finding 7 (notifications POC) persisted", titles.includes("Notifications POC stalled"));
    check(
      "synthetic gate-satisfied Finding persisted",
      titles.includes("Beta submission checklist owner undecided")
    );
    check(
      "only the FIRST of the within-batch duplicate pair persisted",
      titles.includes("Rate limiter config missing for submission API") &&
        !titles.includes("Submission API needs a rate limiter")
    );

    // -- Blocking bar: zero new blocking DecisionGates except the one
    // candidate that established a genuine, complete gate. --
    const blockingFindings = result.findings.filter((f) => f.blocking);
    check(
      "exactly ONE persisted Finding is blocking, and it's the one with a real gate",
      blockingFindings.length === 1 && blockingFindings[0].title === "Beta submission checklist owner undecided",
      JSON.stringify(blockingFindings.map((f) => f.title))
    );
    const persistedGate = blockingFindings[0]?.gate as Record<string, unknown> | null;
    check(
      "the complete normalized gate is retained on the persisted Finding",
      typeof persistedGate?.releaseBoundary === "string" &&
        typeof persistedGate?.dependency === "string" &&
        typeof persistedGate?.evidenceForGate === "string"
    );
    const forecastHandoff = buildForecastInputs([], result.findings, 1);
    check(
      "the persisted blocker becomes exactly one serial forecast gate and no duplicate work item",
      forecastHandoff.gates.length === 1 &&
        forecastHandoff.gates[0].id === blockingFindings[0].id &&
        !forecastHandoff.items.some((item) => item.id === blockingFindings[0].id)
    );

    // -- Origin tag durably present on persisted rationale --
    check(
      "origin tag prefixed onto persisted rationale",
      result.findings.every((f) => /^\[[a-z-]+\] /.test(f.rationale)),
      result.findings.map((f) => f.rationale.slice(0, 20)).join(" | ")
    );

    // -- Suppressed (golden findings 1, 3, 9, 10, 11 + the batch-dup) --
    const suppressedTitles = result.suppressedFindings.map((f) => f.title).sort();
    console.log("\nSuppressed Findings:", suppressedTitles);
    check("exactly 6 suppressed candidates", result.suppressedFindings.length === 6, String(result.suppressedFindings.length));
    for (const expectedTitle of [
      "App Store sandbox review stalled",
      "Separate ticket for autosave conflict resolution",
      "Notification infrastructure not ticketed",
      "Job service depends on auth decision",
      "GitHub/VPN access unresolved for contractors",
      "Submission API needs a rate limiter",
    ]) {
      check(`suppressed: "${expectedTitle}"`, suppressedTitles.includes(expectedTitle));
    }

    // -- Downgraded blocking (goldens 5, 7) --
    const downgradedTitles = result.downgradedBlocking.map((f) => f.title).sort();
    console.log("\nDowngraded blocking:", downgradedTitles);
    check("exactly 2 blocking downgrades", result.downgradedBlocking.length === 2, String(result.downgradedBlocking.length));
    check(
      "downgraded: approval-permission conflict (no gate)",
      downgradedTitles.includes("Approval-permission model conflicts with pending-filter design")
    );
    check("downgraded: notifications POC (release-boundary qualifier)", downgradedTitles.includes("Notifications POC stalled"));

    // -- Signals (golden findings 2, 4) --
    const signalTitles = result.signals.map((s) => s.title).sort();
    console.log("\nSignals:", signalTitles);
    check("exactly 2 signals, never persisted as Findings", result.signals.length === 2, String(result.signals.length));
    check("signal: CI/CD dup tracking", signalTitles.includes("CI/CD pipeline tracked in two places"));
    check(
      "signal: SOF-510 direction reversal",
      signalTitles.includes("SOF-510 merge direction reversed within 24 hours")
    );

    // -- Clarifications (golden finding 1's residual uncertainty) --
    check("exactly 1 clarification, never persisted as a Finding", result.clarifications.length === 1, String(result.clarifications.length));
    check(
      "clarification carries a concrete question",
      result.clarifications[0]?.question.includes("App Store sandbox approval")
    );

    // -- No new obligation double-counted: pre-existing Findings for
    // SOF-572 / SOF-510 / access-blocker are untouched, not duplicated. --
    const allFindingsForScope = await prisma.finding.findMany({
      where: { OR: [{ source: { scopeId: scope.id } }, { contextSnapshot: { scopeId: scope.id } }] },
      select: { title: true },
    });
    for (const seed of EXISTING_FINDINGS_SEED) {
      const count = allFindingsForScope.filter((f) => f.title === seed.title).length;
      check(`pre-existing Finding "${seed.title}" still exists exactly once (not duplicated)`, count === 1, String(count));
    }
    check(
      "total Findings for scope = 3 pre-existing + 5 newly persisted = 8",
      allFindingsForScope.length === 8,
      String(allFindingsForScope.length)
    );

    // -- Signals/clarifications never touch the Finding table at all --
    const signalLikeTitles = new Set([
      "CI/CD pipeline tracked in two places",
      "SOF-510 merge direction reversed within 24 hours",
      "Is App Store sandbox approval still outstanding for Beta?",
    ]);
    check(
      "no signal/clarification title ever appears in the Finding table",
      !allFindingsForScope.some((f) => signalLikeTitles.has(f.title))
    );

    console.log(`\n${pass} passed, ${fail} failed`);
  } catch (err) {
    fail++;
    console.error("EXCEPTION during main assertions:", err);
  } finally {
    // Cleanup: delete everything created for this scope so the harness is
    // safely re-runnable. AuditRun.sourceId is a loose string (no real
    // Prisma relation, see docs/CONTEXT-MODEL.md), so it's matched by id
    // list rather than a nested `source: {...}` filter. Wrapped so a
    // cleanup failure never masks the real assertion failure above.
    try {
      const scopeSourceIds = (
        await prisma.source.findMany({ where: { scopeId: scope.id }, select: { id: true } })
      ).map((s) => s.id);
      await prisma.finding.deleteMany({ where: { OR: [{ source: { scopeId: scope.id } }, { contextSnapshot: { scopeId: scope.id } }] } });
      await prisma.auditRun.deleteMany({
        where: { OR: [{ sourceId: { in: scopeSourceIds } }, { contextSnapshot: { scopeId: scope.id } }] },
      });
      await prisma.contextSnapshot.deleteMany({ where: { scopeId: scope.id } });
      await prisma.source.deleteMany({ where: { scopeId: scope.id } });
      await prisma.scope.delete({ where: { id: scope.id } });
    } catch (cleanupErr) {
      console.error("Cleanup failed (non-fatal to the test result):", cleanupErr);
    }
  }

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
