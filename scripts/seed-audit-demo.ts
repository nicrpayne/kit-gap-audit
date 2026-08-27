// DEV ONLY. The Audit states the Truth Map has to be able to draw.
//
// Every row here is something the product would create through its own
// path: a Hermes-shaped ProjectContextPackage accepted through the real
// boundary (lib/context/snapshot.ts), Findings carrying real citations into
// that package's evidence, an open Decision, a declared dependency, and a
// deliberately old Source so the evidence-freshness checkpoint has a true
// negative to report. Nothing here is a value the app could not produce.
//
// WHY IT EXISTS: a fresh dev database has four findings, all from pasted
// notes, none citing package evidence — so Evidence Solo has no provenance
// chain to trace and the Hermes/Notion/Figma lanes are all unsupplied. That
// is an honest picture of an empty project and a useless one for judging
// whether the instrument works. This fills in the shapes the brief asks the
// implementation to prove:
//
//   missing execution work · unresolved decision · blocking dependency
//   stale evidence · contradiction between sources
//
// IT IS A FIXTURE, AND IT SAYS SO. Findings created here carry a
// "[demo]" marker in their rationale so nothing in this file can ever be
// mistaken for a real audit result in a real database.
//
//   npx tsx scripts/seed-audit-demo.ts [scopeId]

import { PrismaClient } from "@prisma/client";
import { persistContextSnapshot } from "../lib/context/snapshot";
import type { ProjectContextPackage } from "../lib/context/package";

const prisma = new PrismaClient();
const DAY = 86_400_000;
const MARK = "[demo fixture]";

async function main() {
  const scopeId = process.argv[2] ?? "jsa";
  const scope = await prisma.scope.findUnique({ where: { id: scopeId } });
  if (!scope) throw new Error(`Unknown scope "${scopeId}". Run prisma/seed-dev.ts first.`);

  const now = Date.now();

  // ── 1. The Scope starts reading requirements and design ────────────
  //
  // Notion/Figma lanes are "supplied" purely because the Scope names pages
  // to read. These are the same fields /scopes writes.
  await prisma.scope.update({
    where: { id: scope.id },
    data: {
      notionPageIds: ["demo-notion-jsa-scope", "demo-notion-offline-spec"],
      figmaRefs: ["demoFileKey:12-345"],
    },
  });

  // ── 2. A Hermes package, accepted through the real boundary ────────
  const pkg: ProjectContextPackage = {
    version: "1.0",
    packageId: "audit-demo-2026-08-26",
    producer: "hermes",
    generatedAt: new Date(now - 2 * DAY).toISOString(),
    scopeId: scope.id,
    sources: [
      {
        sourceType: "notion",
        sourceRef: "JSA delivery scope",
        registrationId: null, // ad-hoc: makes no tracking-policy claim
        role: "requirements_of_record",
        status: "candidate",
        observedAt: new Date(now - 2 * DAY).toISOString(),
        succeeded: true,
        detail: null,
      },
      {
        sourceType: "figma",
        sourceRef: "JSA · Offline capture flow",
        registrationId: null,
        role: "design_reference",
        status: "candidate",
        observedAt: new Date(now - 5 * DAY).toISOString(),
        succeeded: true,
        detail: null,
      },
      {
        sourceType: "transcript",
        sourceRef: "Delivery sync · 21 Aug",
        registrationId: null,
        role: "raw_evidence",
        status: "candidate",
        observedAt: new Date(now - 6 * DAY).toISOString(),
        succeeded: true,
        detail: null,
      },
    ],
    evidence: [
      {
        id: "notion-scope-row-14",
        sourceRef: "JSA delivery scope",
        kind: "row",
        excerpt:
          "Conflict resolution for offline submissions must be handled before field pilot — two devices editing the same JSA cannot silently overwrite.",
        externalRef: "demo-notion-jsa-scope#row-14",
        data: { section: "Offline", status: "Committed" },
      },
      {
        id: "notion-scope-row-22",
        sourceRef: "JSA delivery scope",
        kind: "row",
        excerpt: "Design ownership for the shared hazard components sits with the Design team for this release.",
        externalRef: "demo-notion-jsa-scope#row-22",
        data: { section: "Ownership", status: "Committed" },
      },
      {
        id: "figma-frame-88",
        sourceRef: "JSA · Offline capture flow",
        kind: "frame",
        excerpt:
          "Offline capture flow shows a merge screen with 'keep mine / keep theirs / merge' — no corresponding ticket exists.",
        externalRef: "demoFileKey:12-345",
      },
      {
        id: "sync-0214",
        sourceRef: "Delivery sync · 21 Aug",
        kind: "note",
        excerpt: "\"Platform said the shared components are ours now, which is not what the scope doc says.\"",
      },
      {
        id: "sync-0231",
        sourceRef: "Delivery sync · 21 Aug",
        kind: "note",
        excerpt: "\"We still cannot get the VPN access levels signed off, and nobody has taken it.\"",
      },
    ],
    // Hermes UNDERSTANDING, not evidence and not a Finding. Inert here — it
    // rides along exactly as the contract describes.
    derivedClaims: [
      {
        id: "claim-design-ownership",
        kind: "decision",
        statement: "Who owns the shared hazard components for this release",
        evidenceRefs: ["notion-scope-row-22", "sync-0214"],
      },
    ],
    completeness: {
      expectedSources: ["JSA delivery scope", "JSA · Offline capture flow", "Delivery sync · 21 Aug"],
      missingSources: [],
      excludedSources: [],
    },
    warnings: [],
  };

  const snapshot = await persistContextSnapshot(pkg, { expectedScopeId: scope.id });
  console.log(`ContextSnapshot ${snapshot.reused ? "reused" : "created"}: ${snapshot.id}`);

  // ── 3. A deliberately OLD pasted source ────────────────────────────
  //
  // So "evidence fresh" has something true to be false about: the newest
  // Source on this Scope is older than the 21-day horizon.
  const staleTitle = `${MARK} Field pilot readiness notes`;
  let stale = await prisma.source.findFirst({ where: { scopeId: scope.id, title: staleTitle } });
  if (!stale) {
    stale = await prisma.source.create({
      data: {
        scopeId: scope.id,
        kind: "notes",
        title: staleTitle,
        content:
          "Field pilot readiness notes.\n\n" +
          "Offline capture is the remaining risk. Conflict resolution for offline submissions " +
          "must be handled before field pilot — two devices editing the same JSA cannot silently " +
          "overwrite. Nobody has picked up the VPN access levels sign-off.\n\n" +
          "Platform believe the shared hazard components transferred to us at the start of the " +
          "release. The scope doc still lists Design as the owner.",
        createdAt: new Date(now - 34 * DAY),
      },
    });
  }

  // ── 4. Findings, each CITING real evidence in the snapshot ─────────
  //
  // Shapes proven: missing work, unresolved decision, blocking dependency
  // (a blocking risk that names what it blocks), and a contradiction.
  const findings = [
    {
      key: "offline-conflict",
      type: "missing_work",
      title: "Offline conflict resolution is specified and designed, but not tracked",
      quote:
        "Conflict resolution for offline submissions must be handled before field pilot — two devices editing the same JSA cannot silently overwrite.",
      rationale: `${MARK} Requirements commit to it and a Figma frame designs it, but no Linear issue covers it. Execution does not contain what requirements and design both assume.`,
      severity: "high",
      blocking: false,
      owner: null,
      blocks: null,
      estimateHint: "4-9 days",
      evidenceRefs: ["notion-scope-row-14", "figma-frame-88"],
      matchedIssues: [] as string[],
    },
    {
      key: "design-ownership",
      type: "decision",
      title: "Ownership of the shared hazard components is unresolved",
      quote: "\"Platform said the shared components are ours now, which is not what the scope doc says.\"",
      rationale: `${MARK} The scope document assigns these to Design; the delivery sync records Platform handing them over. Nobody has recorded a decision either way.`,
      severity: "high",
      blocking: true,
      owner: null,
      blocks: "Shared hazard component work",
      estimateHint: null,
      evidenceRefs: ["notion-scope-row-22", "sync-0214"],
      matchedIssues: [],
    },
    {
      key: "vpn-access",
      type: "risk",
      title: "VPN access-level sign-off has no owner and is holding onboarding",
      quote: "\"We still cannot get the VPN access levels signed off, and nobody has taken it.\"",
      rationale: `${MARK} Recorded as blocking in the delivery sync, with no owner named and no resolution stored.`,
      severity: "high",
      blocking: true,
      owner: null,
      blocks: "New engineer onboarding",
      estimateHint: null,
      evidenceRefs: ["sync-0231"],
      matchedIssues: [],
    },
    {
      key: "ownership-contradiction",
      type: "contradiction",
      title: "Scope document and delivery sync disagree on component ownership",
      quote: "Design ownership for the shared hazard components sits with the Design team for this release.",
      rationale: `${MARK} The requirements-of-record and the meeting record state different owners, and neither is marked authoritative.`,
      severity: "medium",
      blocking: false,
      owner: null,
      blocks: null,
      estimateHint: null,
      evidenceRefs: ["notion-scope-row-22", "sync-0214"],
      matchedIssues: [],
    },
  ];

  let created = 0;
  for (const f of findings) {
    // Idempotent on title within this Scope's snapshot — re-running the
    // fixture must not multiply findings.
    const existing = await prisma.finding.findFirst({
      where: { title: f.title, contextSnapshotId: snapshot.id },
    });
    if (existing) continue;
    await prisma.finding.create({
      data: {
        type: f.type,
        title: f.title,
        quote: f.quote,
        rationale: f.rationale,
        severity: f.severity,
        blocking: f.blocking,
        owner: f.owner,
        blocks: f.blocks,
        estimateHint: f.estimateHint,
        matchedIssues: f.matchedIssues,
        contextSnapshotId: snapshot.id,
        evidenceRefs: f.evidenceRefs,
        sourceId: stale.id,
        status: "open",
      },
    });
    created++;
  }

  // ── 5. One HANDLED finding, so "handled" is not an empty category ──
  const handledTitle = `${MARK} Photo compression settings never agreed`;
  const alreadyHandled = await prisma.finding.findFirst({
    where: { title: handledTitle, contextSnapshotId: snapshot.id },
  });
  if (!alreadyHandled) {
    await prisma.finding.create({
      data: {
        type: "missing_work",
        title: handledTitle,
        quote: "Photo attachment compression before upload",
        rationale: `${MARK} Raised by an earlier audit and since tracked in Linear.`,
        severity: "low",
        blocking: false,
        matchedIssues: ["SOF-121"],
        contextSnapshotId: snapshot.id,
        evidenceRefs: ["notion-scope-row-14"],
        sourceId: stale.id,
        status: "resolved",
        resolution: "Tracked as SOF-121.",
        resolvedAt: new Date(now - 3 * DAY),
      },
    });
    created++;
  }

  // ── 6. An open Decision, so the Decisions lane is supplied ─────────
  //
  // Open and UNGATED: it moves no date, which is the law the Decisions
  // checkpoint reports separately from "is anything recorded at all".
  const decisionTitle = `${MARK} Which offline conflict strategy do we ship?`;
  const existingDecision = await prisma.decision.findFirst({
    where: { scopeId: scope.id, title: decisionTitle },
  });
  if (!existingDecision) {
    await prisma.decision.create({
      data: {
        scopeId: scope.id,
        title: decisionTitle,
        status: "open",
        owner: null, // deliberately unowned: the "owner known" checkpoint has to be able to fail
        rationale: "Last-write-wins, manual merge, or per-field merge.",
        options: [
          { id: "lww", label: "Last write wins" },
          { id: "manual", label: "Manual merge screen" },
        ],
      },
    });
  }

  // ── 7. An AuditRun pair, so current-vs-prior has real timestamps ───
  const runs = await prisma.auditRun.count();
  if (runs === 0) {
    await prisma.auditRun.create({
      data: {
        contextSnapshotId: snapshot.id,
        issueCount: 14,
        findingCount: 4,
        model: "demo-fixture",
        createdAt: new Date(now - 7 * DAY),
      },
    });
    await prisma.auditRun.create({
      data: {
        contextSnapshotId: snapshot.id,
        issueCount: 14,
        findingCount: 5,
        model: "demo-fixture",
        createdAt: new Date(now - 1 * DAY),
      },
    });
  }

  console.log(`Seeded Audit demo for "${scope.name}": ${created} finding(s) created.`);
  console.log(`Open /audit?scope=${scope.id}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
