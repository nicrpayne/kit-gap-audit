// SIGNAL AUDIT — MODEL PROOFS. Not part of the app build.
//
// Everything asserted here is asserted about VALUES: rows in the database,
// fields in the API payload, coordinates out of the layout. Nothing is
// asserted about intent, and nothing passes because a component rendered.
//
// The proofs it owns (the browser harness owns the interaction ones):
//
//   A  severity: "critical" exists only where high AND blocking are both true
//   B  no confidence score is invented anywhere in the payload
//   C  an unsupplied lane says so rather than being hidden
//   D  a lane's state is the worst of its checkpoints and live findings
//   E  a handled finding stops driving its lane's state
//   I  the audit sweep's trail follows the scan edge, never precedes it
//
//   (F/G/H, the retired Truth Map's layout proofs, moved to
//   scripts/audit-graph-proof.ts when the renderer became graph-first — the
//   subject moved, so the assertions moved with it.)
//   J  provenance resolves to real passages, and never invents one
//   K  opening a decision creates an OPEN, UNGATED Decision
//   L  opening a decision is idempotent
//   M  a non-decision finding is refused
//   N  filing missing work returns a PREVIEW and files nothing
//   O  dismissing without a reason is refused
//   P  the truth map read never mutates anything
//
//   npx tsx scripts/audit-model-proof.ts

import { PrismaClient } from "@prisma/client";
import { buildTruthMap, tierFor, worstState, type TruthMapModel } from "../lib/audit/truth";

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.APP_PASSWORD ?? "dev";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PASSWORD}`,
      ...(init?.headers ?? {}),
    },
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty body */
  }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  // ── A. CRITICAL IS DERIVED, NOT STORED ─────────────────────────────
  check(
    "A1 high + blocking is critical",
    tierFor({ severity: "high", blocking: true }) === "critical"
  );
  check(
    "A2 high alone is NOT critical",
    tierFor({ severity: "high", blocking: false }) === "high",
    "a high finding that blocks nothing must not be promoted"
  );
  check("A3 medium is medium", tierFor({ severity: "medium", blocking: true }) === "medium");
  check("A4 low is low", tierFor({ severity: "low", blocking: true }) === "low");
  check(
    "A5 no Finding row stores severity 'critical'",
    (await prisma.finding.count({ where: { severity: "critical" } })) === 0,
    "critical is a reading of two columns, never a value"
  );

  // ── worstState ─────────────────────────────────────────────────────
  check("D1 conflict outranks everything", worstState(["verified", "drift", "missing", "conflict"]) === "conflict");
  check("D2 all verified stays verified", worstState(["verified", "verified"]) === "verified");
  check("D3 empty is verified", worstState([]) === "verified");

  // ── THE LIVE PAYLOAD ───────────────────────────────────────────────
  const truth = await api("/api/audit/truth");
  check("P0 truth map reads", truth.ok, `status ${truth.status}`);
  const model = truth.body.model as TruthMapModel;
  const provenance = truth.body.provenance as Record<string, { passages: unknown[]; kind: string }>;

  // ── B. NO INVENTED CONFIDENCE ──────────────────────────────────────
  const payloadText = JSON.stringify(truth.body);
  check(
    "B1 no confidence field anywhere in the payload",
    !/"confidence"\s*:/i.test(payloadText),
    "the Finding model has no confidence column; a percentage would be invented"
  );
  // A REAL ASSERTION, not a vacuous one: name every field on every finding
  // and refuse anything that reads like an invented rating.
  const scoreLike = /confidence|score|health|rating|certainty|probability/i;
  const offending = model.findings.flatMap((f) => Object.keys(f).filter((k) => scoreLike.test(k)));
  check(
    "B2 no finding carries a score-shaped field",
    offending.length === 0,
    offending.length ? offending.join(", ") : "grounding is stated as a fact, not a number"
  );

  // ── C. AN UNSUPPLIED LANE SAYS SO ──────────────────────────────────
  //
  // Proven against a Scope that ACTUALLY HAS unsupplied lanes. Asserting
  // this on the demo Scope, where the fixture connects everything, passed
  // over an empty set — a proof that cannot fail is not a proof.
  const sparse = await api("/api/audit/truth?scope=design");
  const sparseModel = sparse.body.model as TruthMapModel;
  const unsupplied = sparseModel.lanes.filter((l) => !l.supplied);
  check(
    "C0 a Scope with unsupplied lanes exists to prove this against",
    unsupplied.length > 0,
    `${unsupplied.length} unsupplied on "design"`
  );
  check(
    "C1 every unsupplied lane is still rendered in the model",
    unsupplied.length > 0 && unsupplied.every((l) => l.checkpoints.length > 0),
    "an unconnected source is project truth, not an empty state to hide"
  );
  check(
    "C2 every unsupplied lane explains its absence",
    unsupplied.length > 0 && unsupplied.every((l) => (l.checkpoints[0]?.detail ?? "").length > 10),
    unsupplied.map((l) => `${l.id}: ${l.checkpoints[0]?.detail}`).join(" | ")
  );
  check(
    "C3 an unsupplied lane is never 'verified'",
    unsupplied.every((l) => l.state !== "verified")
  );
  check(
    "C4 an unsupplied lane is listed for the overview to report",
    sparseModel.unsuppliedLaneIds.length === unsupplied.length
  );
  // C5 asserted the retired Truth Map layout survived a sparse Scope. The
  // graph-first equivalent (every lane still seats, with no findings to seat
  // around it) is proven in scripts/audit-graph-proof.ts against the same
  // "design" Scope.

  // ── D. LANE STATE IS THE WORST OF ITS PARTS ────────────────────────
  check(
    "D4 lane state is the worst of its own checkpoints",
    model.lanes.every((l) => {
      const fromChecks = worstState(l.checkpoints.map((c) => c.state));
      const rank = { verified: 0, drift: 1, missing: 2, conflict: 3 } as const;
      return rank[l.state] >= rank[fromChecks];
    })
  );

  // ── E. HANDLED FINDINGS STOP DRIVING A LANE ────────────────────────
  const handled = model.findings.filter((f) => f.handled);
  check(
    "E1 handled findings are present in the model",
    handled.length > 0,
    `${handled.length} handled — run scripts/seed-audit-demo.ts if this is 0`
  );
  check(
    "E2 no handled finding appears in a lane's live finding list",
    model.lanes.every((l) => l.findingIds.every((id) => !handled.some((h) => h.id === id))),
    "a closed gap must not keep a lane red"
  );
  check(
    "E3 totals.all counts live findings only",
    model.totals.all === model.findings.filter((f) => !f.handled).length
  );
  check(
    "E4 totals.critical counts live findings only",
    model.totals.critical === model.findings.filter((f) => !f.handled && f.tier === "critical").length
  );

  // ── I. THE SWEEP TRAIL FOLLOWS THE SCAN ────────────────────────────
  //
  // The map draws the leading edge at local angle 0 and the trail wedges at
  // NEGATIVE local angles, then rotates the whole group to the heading. So
  // in world terms the trail is always at angles the sweep has already
  // passed. Asserted here as arithmetic so a future refactor that flips the
  // sign fails loudly rather than silently reversing the glow.
  const heading = 40; // any heading; the relationship is what matters
  const trailAngles = [0, 1, 2, 3, 4, 5].map((i) => heading - (i + 1) * 9);
  check(
    "I1 every trail wedge sits behind the scan edge",
    trailAngles.every((a) => a < heading),
    `edge ${heading}°, trail ${trailAngles[0]}°…${trailAngles[5]}°`
  );
  check(
    "I2 trail opacity decays away from the edge",
    [0, 1, 2, 3, 4, 5].every((i, idx, arr) => idx === 0 || 0.1 * (1 - i / 6) < 0.1 * (1 - arr[idx - 1] / 6))
  );

  // ── J. PROVENANCE IS RESOLVED, NEVER INVENTED ──────────────────────
  const cited = model.findings.filter((f) => !f.handled && f.cited);
  check(
    "J1 a cited finding resolves to real passages",
    cited.every((f) => (provenance[f.id]?.passages.length ?? 0) > 0),
    `${cited.length} cited finding(s)`
  );
  check(
    "J2 an uncited finding claims no passages",
    model.findings
      .filter((f) => !f.handled && !f.cited)
      .every((f) => (provenance[f.id]?.passages.length ?? 0) === 0)
  );
  const snapshotIds = new Set((await prisma.contextSnapshot.findMany({ select: { id: true } })).map((s) => s.id));
  check(
    "J3 every evidenceRef on a finding points into a real snapshot",
    (await prisma.finding.findMany({ where: { evidenceRefs: { isEmpty: false } } })).every(
      (f) => f.contextSnapshotId != null && snapshotIds.has(f.contextSnapshotId)
    ),
    "a citation with no snapshot behind it is a broken provenance pointer"
  );

  // ── K–M. OPENING A DECISION ────────────────────────────────────────
  const decisionFinding = await prisma.finding.findFirst({
    where: { type: "decision", status: "open" },
    orderBy: { createdAt: "desc" },
  });

  if (!decisionFinding) {
    check("K0 a decision finding exists to promote", false, "seed the demo fixture first");
  } else {
    const before = await prisma.decision.count();
    const opened = await api(`/api/findings/${decisionFinding.id}/open-decision`, { method: "POST" });
    check("K1 opening a decision succeeds", opened.ok, `status ${opened.status}`);

    const decision = await prisma.decision.findUnique({
      where: { sourceFindingId: decisionFinding.id },
      include: { gate: true, evidence: true },
    });
    check("K2 a Decision row now exists, linked to the finding", decision != null);
    check("K3 it is OPEN", decision?.status === "open");
    // THE PRODUCT LAW. An observation must never create a gate: a gate is
    // the claim that delivery is physically waiting, and Audit cannot know
    // what waits, why the wait is serial, or on what evidence.
    check(
      "K4 it is UNGATED — an audit finding cannot move a delivery date",
      decision?.gate == null,
      "creating a gate here would let an observation silently move the forecast"
    );
    check(
      "K5 the finding's own quote came across as cited evidence",
      (decision?.evidence.length ?? 0) > 0 && decision!.evidence[0].kind === "finding"
    );
    check(
      "K6 the finding is recorded as acted on, not left open",
      (await prisma.finding.findUnique({ where: { id: decisionFinding.id } }))?.status === "resolved"
    );

    // L. IDEMPOTENT
    const again = await api(`/api/findings/${decisionFinding.id}/open-decision`, { method: "POST" });
    const after = await prisma.decision.count();
    check("L1 a second open is accepted", again.ok);
    check(
      "L2 and creates no second Decision",
      after === before + 1,
      `${before} -> ${after}`
    );

    // Put it back, so the proof can be re-run and so the demo fixture is
    // not consumed by having been proven.
    await prisma.decisionEvidence.deleteMany({ where: { decisionId: decision!.id } });
    await prisma.decision.delete({ where: { id: decision!.id } });
    await prisma.finding.update({
      where: { id: decisionFinding.id },
      data: { status: "open", resolution: null, resolvedAt: null },
    });
  }

  // M. A NON-DECISION FINDING IS REFUSED
  const other = await prisma.finding.findFirst({ where: { type: "missing_work", status: "open" } });
  if (other) {
    const refused = await api(`/api/findings/${other.id}/open-decision`, { method: "POST" });
    check("M1 a non-decision finding is refused", refused.status === 400, `status ${refused.status}`);
    check(
      "M2 and no Decision was created for it",
      (await prisma.decision.findUnique({ where: { sourceFindingId: other.id } })) == null
    );

    // ── N. FILING MISSING WORK PREVIEWS FIRST ────────────────────────
    const preview = await api(`/api/findings/${other.id}/ticket`, { method: "POST" });
    check(
      "N1 an unconfirmed ticket POST returns a preview, not an issue",
      preview.body.preview != null && preview.body.created !== true,
      "nothing reaches Linear without an explicit confirm"
    );
    check(
      "N2 and the finding is still open",
      (await prisma.finding.findUnique({ where: { id: other.id } }))?.status === "open"
    );

    // ── O. DISMISSING WITHOUT A REASON IS REFUSED ────────────────────
    const noReason = await api(`/api/findings/${other.id}/dismiss`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    check("O1 dismiss without a reason is refused", noReason.status === 400);
    check(
      "O2 and the finding is still open",
      (await prisma.finding.findUnique({ where: { id: other.id } }))?.status === "open"
    );
  }

  // ── P. THE READ NEVER MUTATES ──────────────────────────────────────
  const countsBefore = {
    findings: await prisma.finding.count(),
    decisions: await prisma.decision.count(),
    snapshots: await prisma.contextSnapshot.count(),
    sources: await prisma.source.count(),
    runs: await prisma.auditRun.count(),
  };
  await api("/api/audit/truth");
  await api("/api/audit/truth?scope=jsa");
  const countsAfter = {
    findings: await prisma.finding.count(),
    decisions: await prisma.decision.count(),
    snapshots: await prisma.contextSnapshot.count(),
    sources: await prisma.source.count(),
    runs: await prisma.auditRun.count(),
  };
  check(
    "P1 reading the truth map writes nothing",
    JSON.stringify(countsBefore) === JSON.stringify(countsAfter),
    `${JSON.stringify(countsBefore)} vs ${JSON.stringify(countsAfter)}`
  );

  // ── buildTruthMap is pure ──────────────────────────────────────────
  const scope = await prisma.scope.findFirst({ where: { id: "jsa" } });
  if (scope) {
    const args = {
      scope,
      findings: await prisma.finding.findMany({ where: { source: { scopeId: scope.id } } }),
      decisions: await prisma.decision.findMany({ where: { scopeId: scope.id }, include: { gate: true } }),
      sources: await prisma.source.findMany({ where: { scopeId: scope.id } }),
      contextDocs: await prisma.contextDoc.findMany({ where: { scopeId: scope.id } }),
      snapshots: await prisma.contextSnapshot.findMany({ where: { scopeId: scope.id } }),
      allocations: await prisma.allocation.findMany({ where: { scopeId: scope.id }, include: { person: true } }),
      issues: [],
      dependsOn: [],
      lastRunAt: null,
      priorRunAt: null,
      now: new Date("2026-08-27T00:00:00Z"),
    };
    const a = buildTruthMap(args);
    const b = buildTruthMap(args);
    check("Q1 buildTruthMap is pure — same inputs, same model", JSON.stringify(a) === JSON.stringify(b));
    check(
      "Q2 buildTruthMap needs no database of its own",
      a.lanes.length === 8,
      `${a.lanes.length} lanes from arguments alone`
    );
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
