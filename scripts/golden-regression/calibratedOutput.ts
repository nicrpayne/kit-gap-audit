// A hand-authored stand-in for "what a well-calibrated model, following
// the v2 prompt (lib/audit/prompts/audit-v1.ts), should return for the
// golden evidence set in fixture.ts." This is NOT a live model call --
// this sandbox has no ANTHROPIC_API_KEY (see docs/AUDIT-CALIBRATION.md,
// "Golden Regression Harness"). Injected via AuditRunOptions.complete in
// e2e.ts to prove the DETERMINISTIC layer (reconciliation suppression,
// qualifier contradiction, blocking/gate bar, within-batch dedup,
// citation safety net) produces the golden-set-expected outcome given
// correct model judgment. The semantic question -- will the real model
// actually produce judgments this good -- is explicitly NOT proven here;
// see RUBRIC.md for how to score that separately once a real model call
// is available.
//
// Each block below is commented with which golden finding (1-11, per the
// task brief) it exercises and what deterministic outcome is expected.

export const CALIBRATED_CANDIDATES: unknown[] = [
  // Golden Finding 1 (App Store sandbox stalled) -- expect SUPPRESSED as
  // a duplicate of the existing "App Store sandbox review pending Apple
  // approval" / SOF-572 Finding.
  {
    kind: "finding",
    type: "risk",
    title: "App Store sandbox review stalled",
    quote: "App Store sandbox review is still stuck waiting on Apple; no update in two weeks.",
    rationale:
      "Wiki note describing the same stalled Apple sandbox review already tracked by the open Finding citing SOF-572 -- not a new underlying obligation.",
    severity: "medium",
    estimateHint: "decision, not a build",
    owner: null,
    blocks: "Beta submission",
    matchedIssues: ["SOF-572"],
    evidenceRefs: ["wiki-1"],
    reasoningOrigin: "explicit",
    qualifiers: {
      explicitlyTicketed: false,
      explicitlyOutOfProjectScope: false,
      explicitlyDeferred: false,
      explicitlyNotReleaseBlocker: false,
    },
    reconciliation: {
      newObligation: false,
      checkedAgainst: ["SOF-572", "App Store sandbox review pending Apple approval"],
      matchedExistingId: "App Store sandbox review pending Apple approval (SOF-572)",
      reason: "Same underlying Apple sandbox approval risk already open.",
    },
    blocking: true,
    gate: null,
  },
  // The residual genuine uncertainty from Finding 1 -- preserved as a
  // clarification instead of forced into the suppressed Finding above.
  {
    kind: "clarification",
    title: "Is App Store sandbox approval still outstanding for Beta?",
    known: "Historical evidence (wiki, observed 2026-06-20) describes Apple sandbox approval as unresolved.",
    unknown: "Whether approval remains unresolved today, and whether the current Beta boundary depends on it.",
    question: "Is App Store sandbox approval still outstanding, and is it required before the current Beta release boundary?",
    outcomeIfAnswered:
      "If still outstanding and gating, SOF-572 should be marked blocking with an explicit gate; if resolved, it should be closed out.",
    evidenceRefs: ["wiki-1"],
    reasoningOrigin: "explicit",
  },

  // Golden Finding 2 (possible duplicate CI/CD tracking) -- expect a
  // SIGNAL, never a persisted Finding.
  {
    kind: "signal",
    category: "possible_duplicate_tracker",
    title: "CI/CD pipeline tracked in two places",
    rationale:
      "CI/CD pipeline setup appears on both the release-readiness board and the infra tracker; unclear whether this is the same item duplicated or two distinct efforts.",
    evidenceRefs: ["infra-1"],
    reasoningOrigin: "cross_source",
    suggestedAttention: "Confirm with the team whether these are the same CI/CD workstream before treating either as authoritative.",
  },

  // Golden Finding 3 (separate auto-save ticket absent) -- expect
  // SUPPRESSED, represented by SOF-510.
  {
    kind: "finding",
    type: "missing_work",
    title: "Separate ticket for autosave conflict resolution",
    quote: "Need a separate ticket for autosave conflict resolution on flaky connections.",
    rationale:
      "Wiki note asking for a dedicated ticket, but autosave conflict handling is already represented by the open SOF-510 Finding/ticket.",
    severity: "low",
    estimateHint: "needs scoping",
    owner: null,
    blocks: null,
    matchedIssues: ["SOF-510"],
    evidenceRefs: ["wiki-2"],
    reasoningOrigin: "explicit",
    qualifiers: {
      explicitlyTicketed: false,
      explicitlyOutOfProjectScope: false,
      explicitlyDeferred: false,
      explicitlyNotReleaseBlocker: false,
    },
    reconciliation: {
      newObligation: false,
      checkedAgainst: ["SOF-510", "Offline autosave conflict resolution approach"],
      matchedExistingId: "Offline autosave conflict resolution approach (SOF-510)",
      reason: "Autosave conflict handling already represented by SOF-510; a separate ticket would duplicate it.",
    },
    blocking: false,
    gate: null,
  },

  // Golden Finding 4 (SOF-510 direction reversed within 24h) -- expect a
  // SIGNAL (direction-change), never a persisted duplicate forecast item.
  {
    kind: "signal",
    category: "direction_change",
    title: "SOF-510 merge direction reversed within 24 hours",
    rationale:
      "SOF-510's autosave-conflict merge approach was decided server-wins on Aug 1 morning, then reversed to client-wins the same day.",
    evidenceRefs: ["infra-2", "infra-3"],
    reasoningOrigin: "cross_source",
    suggestedAttention: "Confirm which direction (server-wins vs client-wins) is current before estimating or ticketing SOF-510.",
  },

  // Golden Finding 5 (approval-permission model conflicts with
  // pending-filter design) -- expect PERSISTED, non-blocking (no gate).
  {
    kind: "finding",
    type: "decision",
    title: "Approval-permission model conflicts with pending-filter design",
    quote: "Pending-filter design assumes Supervisors can also approve -- conflicts with the Admin-only approval model in the wiki.",
    rationale:
      "Cross-source conflict between the original Admin-only approval spec and the newer pending-filter design's Supervisor-approval assumption -- a real, new open question not represented elsewhere.",
    severity: "medium",
    estimateHint: "decision, not a build",
    owner: null,
    blocks: "Approval workflow implementation",
    matchedIssues: [],
    evidenceRefs: ["wiki-3", "infra-4"],
    reasoningOrigin: "cross_source",
    qualifiers: {
      explicitlyTicketed: false,
      explicitlyOutOfProjectScope: false,
      explicitlyDeferred: false,
      explicitlyNotReleaseBlocker: false,
    },
    reconciliation: {
      newObligation: true,
      checkedAgainst: ["existing open/handled Findings", "current Linear tickets"],
      matchedExistingId: null,
      reason: "No existing Finding or ticket addresses the Admin-only vs Supervisor-approval conflict.",
    },
    // Requested blocking with no gate -- expect the blocking bar to
    // downgrade this to false (MUST FIX 4).
    blocking: true,
    gate: null,
  },

  // Golden Finding 6 (data migration cutover plan unowned) -- expect only
  // the cutover-OWNERSHIP half raised, non-blocking; the "migration is
  // long-running" half is correctly NOT raised at all since infra-5
  // explicitly disclaims it as a release blocker.
  {
    kind: "finding",
    type: "decision",
    title: "Migration cutover night owner unassigned",
    quote: "No owner assigned for planning the actual cutover night / rollback plan.",
    rationale:
      "The underlying data migration itself is evidenced as not a release blocker, but cutover-night ownership/rollback planning is a distinct, currently-unowned obligation worth a decision Finding.",
    severity: "medium",
    estimateHint: "needs scoping",
    owner: null,
    blocks: "Migration cutover execution",
    matchedIssues: [],
    evidenceRefs: ["infra-6"],
    reasoningOrigin: "coverage",
    qualifiers: {
      explicitlyTicketed: false,
      explicitlyOutOfProjectScope: false,
      explicitlyDeferred: false,
      explicitlyNotReleaseBlocker: false,
    },
    reconciliation: {
      newObligation: true,
      checkedAgainst: ["existing Findings", "current Linear tickets"],
      matchedExistingId: null,
      reason: "No existing Finding or ticket names a cutover-night owner.",
    },
    blocking: false,
    gate: null,
  },

  // Golden Finding 7 (notifications POC stalled) -- expect PERSISTED,
  // non-blocking (explicitly out of the Beta release boundary, but still
  // a real, trackable stall).
  {
    kind: "finding",
    type: "risk",
    title: "Notifications POC stalled",
    quote: "Notifications POC has been on hold for 3 weeks, no active work.",
    rationale:
      "The notifications proof-of-concept has stalled; worth tracking, but notifications are explicitly out of scope for the current Beta release boundary.",
    severity: "low",
    estimateHint: "needs scoping",
    owner: null,
    blocks: "Post-Beta notification rollout",
    matchedIssues: [],
    evidenceRefs: ["wiki-4", "infra-7"],
    reasoningOrigin: "explicit",
    qualifiers: {
      explicitlyTicketed: false,
      explicitlyOutOfProjectScope: false,
      explicitlyDeferred: false,
      explicitlyNotReleaseBlocker: true,
    },
    reconciliation: {
      newObligation: true,
      checkedAgainst: ["existing Findings"],
      matchedExistingId: null,
      reason: "No existing Finding tracks the notifications POC stall.",
    },
    // Requested blocking despite the release-boundary qualifier -- expect
    // downgrade to non-blocking (MUST FIX 2 + 4).
    blocking: true,
    gate: null,
  },

  // Golden Finding 8 (storage/roles/notifications untracked composite) --
  // expect NOTHING raised: newer infra-8 (SOF-601)/infra-9 (SOF-618)
  // supersede the stale wiki-5 composite, and notification infra is
  // already covered by golden Finding 9's evidence. Deliberately no
  // candidate emitted here -- this is the calibrated (correct) behavior.
  // NOTE: unlike the qualifier/reconciliation suppressions above, this
  // one is NOT a deterministic code guardrail -- it depends entirely on
  // the model reading wiki-5 against infra-8/infra-9 and declining to
  // raise it. See RUBRIC.md.

  // Golden Finding 9 (notification infra "not ticketed") -- expect
  // SUPPRESSED: cited evidence's own qualifier (Tickets Created: y)
  // directly contradicts a missing-work claim. Deliberately modeled as an
  // internally-inconsistent candidate (truthful qualifier extraction, but
  // still framed as missing_work) to prove the CODE guardrail catches
  // this even if the model's own restraint doesn't (MUST FIX 2, the
  // task's own literal example).
  {
    kind: "finding",
    type: "missing_work",
    title: "Notification infrastructure not ticketed",
    quote: "Notification infrastructure. Tickets Created: y -- SOF-630 and SOF-631 opened this week to track the work.",
    rationale: "Notification infrastructure work has no dedicated ticket.",
    severity: "medium",
    estimateHint: "needs scoping",
    owner: null,
    blocks: null,
    matchedIssues: ["SOF-630", "SOF-631"],
    evidenceRefs: ["infra-10"],
    reasoningOrigin: "explicit",
    qualifiers: {
      explicitlyTicketed: true,
      explicitlyOutOfProjectScope: false,
      explicitlyDeferred: false,
      explicitlyNotReleaseBlocker: false,
    },
    reconciliation: {
      newObligation: false,
      checkedAgainst: ["SOF-630", "SOF-631"],
      matchedExistingId: "SOF-630, SOF-631",
      reason: "Tickets already created for this work.",
    },
    blocking: false,
    gate: null,
  },

  // Golden Finding 10 (job service depends on auth decision) -- expect
  // SUPPRESSED: evidence explicitly disclaims relevance to the PROJECT
  // (JSA) itself, not just a release milestone.
  {
    kind: "finding",
    type: "decision",
    title: "Job service depends on auth decision",
    quote: "Job service depends on an auth decision that hasn't been made yet.",
    rationale: "Job service work is blocked on an unresolved auth decision.",
    severity: "low",
    estimateHint: "decision, not a build",
    owner: null,
    blocks: "Job service implementation",
    matchedIssues: [],
    evidenceRefs: ["wiki-6", "infra-11"],
    reasoningOrigin: "explicit",
    qualifiers: {
      explicitlyTicketed: false,
      explicitlyOutOfProjectScope: true,
      explicitlyDeferred: true,
      explicitlyNotReleaseBlocker: false,
    },
    reconciliation: {
      newObligation: true,
      checkedAgainst: [],
      matchedExistingId: null,
      reason: "No existing Finding tracks this.",
    },
    blocking: false,
    gate: null,
  },

  // Golden Finding 11 (GitHub/VPN access unresolved) -- expect
  // SUPPRESSED as a near-duplicate of the existing open access-blocker
  // Finding. SOF-645 (a decoy, superficially "notification"-flavored) is
  // explicitly named and rejected as a false match in the reconciliation
  // reason -- exercising the anti-keyword-match requirement.
  {
    kind: "finding",
    type: "risk",
    title: "GitHub/VPN access unresolved for contractors",
    quote: "GitHub/VPN access still hasn't been sorted out for the two new contractors -- blocking their onboarding.",
    rationale: "Contractors still cannot access GitHub/VPN, blocking onboarding.",
    severity: "high",
    estimateHint: "decision, not a build",
    owner: null,
    blocks: "Contractor onboarding",
    matchedIssues: [],
    evidenceRefs: ["wiki-7"],
    reasoningOrigin: "explicit",
    qualifiers: {
      explicitlyTicketed: false,
      explicitlyOutOfProjectScope: false,
      explicitlyDeferred: false,
      explicitlyNotReleaseBlocker: false,
    },
    reconciliation: {
      newObligation: false,
      checkedAgainst: ["Contractor GitHub/VPN access blocked", "SOF-645"],
      matchedExistingId: "Contractor GitHub/VPN access blocked",
      reason:
        "Same underlying access-blocker Finding already open. SOF-645 is a different, unrelated notification-email ticket -- not a match despite superficial keyword overlap with 'notification'/'submission.'",
    },
    blocking: true,
    gate: null,
  },

  // -- Synthetic additions beyond the 11 golden findings, to exercise two
  // more guardrail paths the brief calls out but the 11 findings alone
  // don't isolate cleanly. --

  // Within-batch duplicate backstop (MUST FIX 1's "other proposed
  // Findings in the same audit"): two candidates, same type + same
  // matchedIssues set. Expect the SECOND suppressed even though its own
  // reconciliation.newObligation claims true.
  {
    kind: "finding",
    type: "missing_work",
    title: "Rate limiter config missing for submission API",
    quote: "The submission API rate limiter still needs configuration.",
    rationale: "No rate-limit config exists for the submission API.",
    severity: "medium",
    estimateHint: "1-3 days",
    owner: null,
    blocks: null,
    matchedIssues: ["SOF-699"],
    evidenceRefs: ["infra-6"],
    reasoningOrigin: "explicit",
    qualifiers: {
      explicitlyTicketed: false,
      explicitlyOutOfProjectScope: false,
      explicitlyDeferred: false,
      explicitlyNotReleaseBlocker: false,
    },
    reconciliation: { newObligation: true, checkedAgainst: [], matchedExistingId: null, reason: "New." },
    blocking: false,
    gate: null,
  },
  {
    kind: "finding",
    type: "missing_work",
    title: "Submission API needs a rate limiter",
    quote: "Rate limiting on the submission API is not yet configured.",
    rationale: "Same submission-API rate-limit gap, described again.",
    severity: "medium",
    estimateHint: "1-3 days",
    owner: null,
    blocks: null,
    matchedIssues: ["SOF-699"],
    evidenceRefs: ["infra-6"],
    reasoningOrigin: "explicit",
    qualifiers: {
      explicitlyTicketed: false,
      explicitlyOutOfProjectScope: false,
      explicitlyDeferred: false,
      explicitlyNotReleaseBlocker: false,
    },
    // Deliberately (and wrongly) claims newObligation=true -- the
    // within-batch backstop must catch this regardless.
    reconciliation: { newObligation: true, checkedAgainst: [], matchedExistingId: null, reason: "New." },
    blocking: false,
    gate: null,
  },

  // Positive path: blocking=true WITH a fully-populated gate must survive
  // -- the bar is high, not impossible. Proves the guardrail isn't a
  // blanket blocking=false override.
  {
    kind: "finding",
    type: "decision",
    title: "Beta submission checklist owner undecided",
    quote: "Nobody has confirmed who signs off the Beta submission checklist before App Store upload.",
    rationale: "Beta cannot be submitted until a checklist owner is named and signs off.",
    severity: "high",
    estimateHint: "decision, not a build",
    owner: null,
    blocks: "Beta App Store submission",
    matchedIssues: [],
    evidenceRefs: ["infra-7"],
    reasoningOrigin: "explicit",
    qualifiers: {
      explicitlyTicketed: false,
      explicitlyOutOfProjectScope: false,
      explicitlyDeferred: false,
      explicitlyNotReleaseBlocker: false,
    },
    reconciliation: { newObligation: true, checkedAgainst: [], matchedExistingId: null, reason: "New." },
    blocking: true,
    gate: {
      releaseBoundary: "Beta App Store submission",
      dependency: "Submission cannot proceed without a named checklist sign-off owner",
      evidenceForGate: "infra-7: notifications/submission tracker shows no assigned checklist owner",
    },
  },
];
