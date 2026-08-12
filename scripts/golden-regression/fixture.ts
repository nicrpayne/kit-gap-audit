// The golden regression fixture -- see docs/AUDIT-CALIBRATION.md and
// scripts/golden-regression/README.md.
//
// RECONSTRUCTION NOTE: the real first Hermes handshake packet (2
// registered sources, 19 selected evidence items, the JSA wiki + JSA
// Infrastructure Alignment tracker) is not itself available in this repo
// -- only the forensic classification of its 11 resulting Findings is
// (see the task brief). This fixture is a faithful RECONSTRUCTION built
// directly from that brief's own descriptions of each finding's evidence,
// current state, and expected behavior -- not a copy of the literal
// original evidence text. It is close enough to exercise every
// deterministic guardrail and reconciliation path the brief calls out by
// number; it is not a byte-for-byte replay of the original packet.
//
// 19 evidence items across exactly 2 sources, as the brief specifies.

import type { ProjectContextPackage } from "@/lib/context/package";

export const JSA_WIKI_REF = "jsa-wiki";
export const JSA_INFRA_TRACKER_REF = "jsa-infra-tracker";

// Deliberately much older than the tracker -- the freshness case (golden
// Finding 8) hinges on the wiki being stale relative to current execution
// reality.
export const WIKI_OBSERVED_AT = "2026-06-20T09:00:00Z";
export const INFRA_TRACKER_OBSERVED_AT = "2026-08-10T16:00:00Z";

export function buildGoldenPackage(scopeId: string): ProjectContextPackage {
  return {
    version: "1.0",
    packageId: "golden-regression-001",
    producer: "manual",
    generatedAt: "2026-08-11T12:00:00Z",
    scopeId,
    sources: [
      {
        sourceType: "notion",
        sourceRef: JSA_WIKI_REF,
        registrationId: null,
        role: "JSA wiki",
        status: "active",
        observedAt: WIKI_OBSERVED_AT,
        succeeded: true,
        detail: null,
      },
      {
        sourceType: "spreadsheet",
        sourceRef: JSA_INFRA_TRACKER_REF,
        registrationId: null,
        role: "JSA Infrastructure Alignment operational tracker",
        status: "active",
        observedAt: INFRA_TRACKER_OBSERVED_AT,
        succeeded: true,
        detail: null,
      },
    ],
    evidence: [
      // -- Golden Finding 1: App Store sandbox review stalled (C) --
      {
        id: "wiki-1",
        sourceRef: JSA_WIKI_REF,
        kind: "note",
        excerpt: "App Store sandbox review is still stuck waiting on Apple; no update in two weeks.",
      },
      // -- Golden Finding 2: possible duplicate CI/CD tracking (E -> signal) --
      {
        id: "infra-1",
        sourceRef: JSA_INFRA_TRACKER_REF,
        kind: "row",
        excerpt:
          "CI/CD pipeline setup appears on both the release-readiness board and this tracker -- unclear if same item.",
      },
      // -- Golden Finding 3: separate auto-save ticket absent (C, SOF-510) --
      {
        id: "wiki-2",
        sourceRef: JSA_WIKI_REF,
        kind: "note",
        excerpt: "Need a separate ticket for autosave conflict resolution on flaky connections.",
      },
      // -- Golden Finding 4: SOF-510 direction reversed within 24h (C -> signal) --
      {
        id: "infra-2",
        sourceRef: JSA_INFRA_TRACKER_REF,
        kind: "row",
        excerpt: "SOF-510 direction: server-wins merge for autosave conflicts (decided Aug 1, 9am).",
        data: { ticket: "SOF-510", approach: "server-wins", decidedAt: "2026-08-01T09:00:00Z" },
      },
      {
        id: "infra-3",
        sourceRef: JSA_INFRA_TRACKER_REF,
        kind: "row",
        excerpt:
          "SOF-510 direction reversed: client-wins merge for autosave conflicts (decided Aug 1, 11pm -- supersedes this morning's call).",
        data: { ticket: "SOF-510", approach: "client-wins", decidedAt: "2026-08-01T23:00:00Z" },
      },
      // -- Golden Finding 5: approval-permission model conflicts with pending-filter design (B) --
      {
        id: "wiki-3",
        sourceRef: JSA_WIKI_REF,
        kind: "note",
        excerpt: "Approval-permission model: only Admins can approve JSAs per the original spec.",
      },
      {
        id: "infra-4",
        sourceRef: JSA_INFRA_TRACKER_REF,
        kind: "row",
        excerpt:
          "Pending-filter design assumes Supervisors can also approve -- conflicts with the Admin-only approval model in the wiki.",
      },
      // -- Golden Finding 6: data migration cutover plan unowned/unscoped (B) --
      {
        id: "infra-5",
        sourceRef: JSA_INFRA_TRACKER_REF,
        kind: "row",
        excerpt: "Legacy-data migration is long-running but evidence shows it is not a release blocker for Beta.",
        data: { notReleaseBlocker: true },
      },
      {
        id: "infra-6",
        sourceRef: JSA_INFRA_TRACKER_REF,
        kind: "row",
        excerpt: "No owner assigned for planning the actual cutover night / rollback plan.",
      },
      // -- Golden Finding 7: notifications POC stalled (B) --
      {
        id: "wiki-4",
        sourceRef: JSA_WIKI_REF,
        kind: "note",
        excerpt: "Notifications POC has been on hold for 3 weeks, no active work.",
      },
      {
        id: "infra-7",
        sourceRef: JSA_INFRA_TRACKER_REF,
        kind: "row",
        excerpt: "Notifications are explicitly out of scope for the Beta release; full notification service is post-Beta.",
        data: { releaseBoundary: "Beta", notReleaseBlocker: true },
      },
      // -- Golden Finding 8: storage/roles/notifications untracked composite (D, stale) --
      {
        id: "wiki-5",
        sourceRef: JSA_WIKI_REF,
        kind: "note",
        excerpt: "Composite note: storage, roles, and notifications infra are all still untracked as of this update.",
      },
      {
        id: "infra-8",
        sourceRef: JSA_INFRA_TRACKER_REF,
        kind: "row",
        excerpt: "Storage bucket migration: SOF-601 in progress, 60% done.",
        data: { ticket: "SOF-601" },
      },
      {
        id: "infra-9",
        sourceRef: JSA_INFRA_TRACKER_REF,
        kind: "row",
        excerpt: "Roles/permissions rework: SOF-618 shipped last sprint.",
        data: { ticket: "SOF-618" },
      },
      // -- Golden Finding 9: notification infra "not ticketed" (E, Tickets Created=y) --
      {
        id: "infra-10",
        sourceRef: JSA_INFRA_TRACKER_REF,
        kind: "row",
        excerpt: "Notification infrastructure. Tickets Created: y -- SOF-630 and SOF-631 opened this week to track the work.",
        data: { ticketsCreated: "y", tickets: ["SOF-630", "SOF-631"] },
      },
      // -- Golden Finding 10: job service depends on auth decision (E, deferred/not needed for JSA) --
      {
        id: "wiki-6",
        sourceRef: JSA_WIKI_REF,
        kind: "note",
        excerpt: "Job service depends on an auth decision that hasn't been made yet.",
      },
      {
        id: "infra-11",
        sourceRef: JSA_INFRA_TRACKER_REF,
        kind: "row",
        excerpt: "Auth decision for job service is deferred; explicitly not needed for JSA -- belongs to a later, separate product line.",
        data: { deferred: true, neededForJSA: false },
      },
      // -- Golden Finding 11: GitHub/VPN access unresolved (C, near-dup of existing Finding) --
      {
        id: "wiki-7",
        sourceRef: JSA_WIKI_REF,
        kind: "note",
        excerpt: "GitHub/VPN access still hasn't been sorted out for the two new contractors -- blocking their onboarding.",
      },
      // Decoy: superficially "notification/submission"-flavored, but a
      // DIFFERENT ticket than golden Finding 9's actual match (SOF-630/
      // SOF-631) and unrelated to Finding 11's access blocker. Exists to
      // regression-test that reconciliation matches on underlying
      // obligation, never on shared keywords.
      {
        id: "infra-12",
        sourceRef: JSA_INFRA_TRACKER_REF,
        kind: "row",
        excerpt: "SOF-645: add email notification when a JSA submission fails -- unrelated to access or infra work.",
        data: { ticket: "SOF-645" },
      },
    ],
    completeness: { expectedSources: [JSA_WIKI_REF, JSA_INFRA_TRACKER_REF], missingSources: [], excludedSources: [] },
    warnings: [],
  };
}

// Pre-existing Findings this Scope already has BEFORE the golden audit
// run -- what golden Findings 1, 3, and 11 are supposed to reconcile
// against and recognize as already-represented.
export const EXISTING_FINDINGS_SEED = [
  {
    title: "App Store sandbox review pending Apple approval",
    type: "risk",
    quote: "Sandbox review submitted, awaiting Apple.",
    rationale: "[explicit] Historical risk, still open.",
    severity: "medium",
    blocking: false,
    matchedIssues: ["SOF-572"],
  },
  {
    title: "Offline autosave conflict resolution approach",
    type: "decision",
    quote: "Need to decide the merge strategy for offline autosave conflicts.",
    rationale: "[explicit] Open decision tracked under SOF-510.",
    severity: "medium",
    blocking: false,
    matchedIssues: ["SOF-510"],
  },
  {
    title: "Contractor GitHub/VPN access blocked",
    type: "risk",
    quote: "New contractors cannot get GitHub/VPN access provisioned.",
    rationale: "[explicit] Open access blocker for contractor onboarding.",
    severity: "high",
    blocking: true,
    matchedIssues: [],
  },
] as const;
