// A JSA-SHAPED GRAPH, BUILT IN MEMORY, WITH NO DATABASE AND NO PACKAGE FILE.
//
//   WHY THIS EXISTS AND WHAT IT IS NOT
//
// The real bridge-produced package (scripts/lib/real-package.ts) is
// DELIBERATELY NOT COMMITTED — it carries real meeting transcript excerpts
// and named individuals. Every proof that can reach it uses it. The search
// tranche needs something else as well: a corpus whose EXACT STRINGS a proof
// can assert on. "Searching this quote returns this passage" is only a proof
// if the file states the quote.
//
// So this is a fixture built to the real package's SHAPE — the same source
// ref grammar (`ke://source/transcript/2026-08-19_KE-JSA-Notifications-
// Discussion`), the same evidence id grammar, the same external object types
// and the same Linear identifier grammar — carrying invented content.
//
//   NOTHING HERE IS A CLAIM ABOUT THE REAL PROJECT. The people are invented,
//   the quotes are invented, the tickets are invented. Only the SHAPES are
//   copied, because shapes are what search normalisation has to survive.
//
// It runs through `buildAuditGraph` unchanged, so what search is measured
// against is a real Signal Graph rather than a hand-built node list.

import { buildAuditGraph, type AuditGraph, type GraphEntityInputs } from "../../lib/audit/graph";
import type { FindingProvenance } from "../../lib/audit/provenance";
import type { TruthMapModel } from "../../lib/audit/truth";

const SNAP = "snap-jsa-1";

/** The transcript refs, in the producer's own grammar. The first is the one
    the verified production failure named. */
export const SOURCE_REFS = {
  jsaNotifications: "ke://source/transcript/2026-08-19_KE-JSA-Notifications-Discussion",
  devStandup: "ke://source/transcript/2026-08-25_KE-Dev-Standup",
  devStandupEarlier: "ke://source/transcript/2026-08-11_KE-Dev-Standup",
  fieldPilot: "ke://source/transcript/2026-08-14_KE-Field-Pilot-Readiness",
  scopePage: "ke://source/notion/JSA-Delivery-Scope",
  docufyReview: "ke://source/transcript/2026-08-21_KE-Docufy-Integration-Review",
} as const;

/**
 * EXACT EVIDENCE QUOTATIONS, stated here so a proof can assert on them.
 *
 * These are the strings the "search a visible quote" proof types verbatim.
 * Five of them, per the QA matrix, plus the ones other assertions reach for.
 */
export const QUOTES = {
  offline:
    "Offline capture has to work end to end before the field pilot, otherwise we are shipping a demo.",
  notifications:
    "We never agreed the notification batching window, and support is already seeing duplicate alerts.",
  docufy:
    "Docufy have not confirmed the callback contract, so the integration date is a guess right now.",
  capacity:
    "Two of the four engineers are half on another project, which is not what the plan assumes.",
  tailRisk:
    "The unbounded tail risk here is that approvals slip past the release window and nobody notices.",
  authentication:
    "Authentication for the field devices is still using the shared account, which will not pass review.",
  blockers:
    "The blockers list has not been reviewed in three weeks and half of it is stale.",
} as const;

/** Requirement wording, likewise stated rather than generated. */
export const REQUIREMENTS = {
  offline: "Offline capture must work end to end before the field pilot begins.",
  notifications: "Notification batching must be configurable per site before launch.",
  approvals: "Approvals must complete within two working days of submission.",
  safety: "Safety incidents must be reportable from the device without a network connection.",
} as const;

function truthModel(): TruthMapModel {
  const lane = (id: string, label: string, family: string, supplied: boolean) => ({
    id,
    label,
    family,
    state: "supplied" as const,
    supplied,
    checkpoints: [] as TruthMapModel["lanes"][number]["checkpoints"],
  });

  const lanes = [
    lane("linear", "Linear", "execution", true),
    lane("notion", "Notion", "requirements", true),
    lane("figma", "Figma", "design", false),
    lane("evidence", "Evidence", "evidence", true),
    lane("decisions", "Decisions", "decisions", true),
    lane("dependencies", "Dependencies", "dependencies", true),
    lane("capacity", "Capacity", "capacity", true),
    lane("hermes", "External intelligence", "external", true),
  ] as unknown as TruthMapModel["lanes"];

  lanes[0].checkpoints = [
    {
      id: "cp-linear-1",
      label: "Execution is being read",
      state: "supplied",
      detail: "46 issues read from the JSA project on 2026-08-25.",
    },
  ] as unknown as TruthMapModel["lanes"][number]["checkpoints"];

  const findings = [
    {
      id: "f-notif",
      type: "contradiction",
      kindLabel: "Contradiction",
      title: "Notification batching window was never agreed",
      tier: "high",
      state: "conflict",
      needsHuman: true,
      laneId: "evidence",
      relatedLaneIds: ["notion"],
      severity: "high",
      blocking: true,
      status: "open",
      quote: QUOTES.notifications,
      rationale:
        "The scope page requires configurable notification batching; no decision records the window, and support is seeing duplicate alerts.",
      owner: "Lucija Jovanovska",
      blocks: null,
      matchedIssues: ["SOF-487"],
      estimateHint: null,
      createdAt: "2026-08-20T09:00:00.000Z",
      cited: true,
      evidenceRefCount: 1,
      handled: false,
    },
    {
      id: "f-offline",
      type: "missing_work",
      kindLabel: "Missing work",
      title: "Offline capture has no ticket before the field pilot",
      tier: "critical",
      state: "missing",
      needsHuman: false,
      laneId: "linear",
      relatedLaneIds: ["notion"],
      severity: "critical",
      blocking: true,
      status: "open",
      quote: QUOTES.offline,
      rationale: "The scope page requires offline capture end to end; execution contains no issue for it.",
      owner: null,
      blocks: null,
      matchedIssues: [],
      estimateHint: null,
      createdAt: "2026-08-15T09:00:00.000Z",
      cited: true,
      evidenceRefCount: 1,
      handled: false,
    },
    {
      id: "f-docufy",
      type: "risk",
      kindLabel: "Risk",
      title: "Docufy callback contract is unconfirmed",
      tier: "high",
      state: "conflict",
      needsHuman: false,
      laneId: "dependencies",
      relatedLaneIds: ["evidence"],
      severity: "high",
      blocking: true,
      status: "open",
      quote: QUOTES.docufy,
      rationale: "The integration date depends on a contract the vendor has not confirmed.",
      owner: "Marco Reyes",
      blocks: "docufy",
      matchedIssues: ["SOF-510"],
      estimateHint: null,
      createdAt: "2026-08-22T09:00:00.000Z",
      cited: true,
      evidenceRefCount: 1,
      handled: false,
    },
    {
      id: "f-auth",
      type: "risk",
      kindLabel: "Risk",
      title: "Field devices still authenticate on a shared account",
      tier: "medium",
      state: "drift",
      needsHuman: false,
      laneId: "evidence",
      relatedLaneIds: [],
      severity: "medium",
      blocking: false,
      status: "open",
      quote: QUOTES.authentication,
      rationale: "Shared-account authentication will not pass the security review before release.",
      owner: null,
      blocks: null,
      matchedIssues: [],
      estimateHint: null,
      createdAt: "2026-08-18T09:00:00.000Z",
      cited: true,
      evidenceRefCount: 1,
      handled: false,
    },
  ] as unknown as TruthMapModel["findings"];

  return {
    scopeId: "jsa",
    scopeName: "JSA",
    lanes,
    findings,
    totals: { all: findings.length, critical: 1, needsHuman: 1, handled: 0 },
    lastRunAt: "2026-08-26T10:00:00.000Z",
    priorRunAt: "2026-08-19T10:00:00.000Z",
    unsuppliedLaneIds: ["figma"],
  };
}

function provenance(): Record<string, FindingProvenance> {
  const snapshot = {
    id: SNAP,
    producer: "hermes-bridge",
    packageId: "jsa_structured_intelligence_v4",
    generatedAt: "2026-08-26T08:00:00.000Z",
    acceptedAt: "2026-08-26T09:30:00.000Z",
  };
  const psg = (
    evidenceId: string,
    excerpt: string,
    sourceRef: string,
    sourceType: string,
    observedAt: string
  ) => ({
    evidenceId,
    excerpt,
    sourceRef,
    sourceType,
    observedAt,
    role: "evidence",
    status: "active",
    externalRef: null,
    anchor: {},
    independence: null,
  });

  return {
    "f-notif": {
      findingId: "f-notif",
      kind: "package",
      quote: QUOTES.notifications,
      snapshot,
      passages: [
        psg("ke-ev-0132", QUOTES.notifications, SOURCE_REFS.jsaNotifications, "transcript", "2026-08-19T14:00:00.000Z"),
      ],
      source: null,
      matchedIssues: ["SOF-487"],
      unresolvedRefs: [],
    },
    "f-offline": {
      findingId: "f-offline",
      kind: "package",
      quote: QUOTES.offline,
      snapshot,
      passages: [
        psg("ke-ev-0088", QUOTES.offline, SOURCE_REFS.fieldPilot, "transcript", "2026-08-14T14:00:00.000Z"),
      ],
      source: null,
      matchedIssues: [],
      unresolvedRefs: [],
    },
    "f-docufy": {
      findingId: "f-docufy",
      kind: "package",
      quote: QUOTES.docufy,
      snapshot,
      passages: [
        psg("ke-ev-0201", QUOTES.docufy, SOURCE_REFS.docufyReview, "transcript", "2026-08-21T14:00:00.000Z"),
      ],
      source: null,
      matchedIssues: ["SOF-510"],
      unresolvedRefs: [],
    },
    "f-auth": {
      findingId: "f-auth",
      kind: "package",
      quote: QUOTES.authentication,
      snapshot,
      passages: [
        psg("ke-ev-0155", QUOTES.authentication, SOURCE_REFS.devStandup, "transcript", "2026-08-25T14:00:00.000Z"),
      ],
      source: null,
      matchedIssues: [],
      unresolvedRefs: [],
    },
  } as unknown as Record<string, FindingProvenance>;
}

function entities(): GraphEntityInputs {
  const req = (evidenceId: string, statement: string, sourceRef: string, section: string, observedAt: string) => ({
    snapshotId: SNAP,
    evidenceId,
    scopeId: "jsa",
    statement,
    evidenceKind: "row",
    sourceRef,
    sourceType: "notion",
    sourceRole: "requirements_of_record",
    sourceStatus: "candidate",
    registrationId: null,
    observedAt,
    dataStatus: "Committed",
    section,
    externalRef: "notion-page-jsa-scope",
  });

  const intelObject = (
    externalId: string,
    intelligenceType: string,
    statement: string,
    evidenceRefs: string[],
    observedDate: string,
    isCurrent = true
  ) => ({
    snapshotId: SNAP,
    externalId,
    intelligenceType,
    trust: "external_unverified",
    statement,
    statementBasis: "verbatim",
    status: "open",
    isCurrent,
    observedDate,
    dates: {},
    scope: ["jsa"],
    evidenceRefs,
    fields: {},
    provenance: {},
    extra: {},
  });

  return {
    scope: {
      id: "jsa",
      name: "JSA Field Safety",
      dependsOnScopeIds: ["docufy"],
      notionPageIds: ["JSA-Delivery-Scope"],
      figmaRefs: ["figma://file/JSA-Device-Flows"],
    },
    decisions: [
      {
        id: "d-batching",
        title: "Batch notifications on a fifteen minute window",
        status: "proposed",
        owner: "Lucija Jovanovska",
        sourceFindingId: "f-notif",
        gate: null,
      },
      {
        id: "d-release",
        title: "Hold the release until approvals clear",
        status: "committed",
        owner: "Marco Reyes",
        sourceFindingId: null,
        gate: {
          id: "g-docufy",
          targetScopeId: "docufy",
          dependency: "Docufy callback contract signed",
          low: 5,
          likely: 12,
          high: 30,
        },
      },
    ],
    dependsOn: [{ id: "docufy", name: "Docufy Integration", targetDate: "2026-10-01" }],
    work: [
      {
        identifier: "SOF-487",
        title: "Notification batching configuration per site",
        state: "In Progress",
        stateType: "started",
        estimate: 5,
        assignee: "Lucija Jovanovska",
        parentIdentifier: "SOF-400",
        parentTitle: "Notifications",
      },
      {
        identifier: "SOF-510",
        title: "Docufy callback receiver",
        state: "Todo",
        stateType: "unstarted",
        estimate: 8,
        assignee: "Marco Reyes",
        parentIdentifier: "SOF-401",
        parentTitle: "Docufy integration",
      },
      {
        identifier: "SOF-522",
        title: "Device authentication hardening",
        state: "Todo",
        stateType: "unstarted",
        estimate: 3,
        assignee: "Priya Nair",
        parentIdentifier: null,
        parentTitle: null,
      },
      {
        identifier: "SOF-533",
        title: "Release checklist and approvals tracker",
        state: "Backlog",
        stateType: "backlog",
        estimate: 2,
        assignee: null,
        parentIdentifier: null,
        parentTitle: null,
      },
    ],
    registrations: [
      {
        id: "reg-scope",
        sourceType: "notion",
        sourceRef: SOURCE_REFS.scopePage,
        status: "active",
        supersededByRegistrationId: null,
      },
    ],
    people: [
      {
        personId: "p-lucija",
        name: "Lucija Jovanovska",
        fte: 1,
        active: true,
        synthetic: false,
        fraction: 0.6,
        scopeCount: 2,
        switchFactor: 0.88,
        effectiveFte: 0.528,
        contextSwitchCostPct: 12,
        allocations: [],
      },
      {
        personId: "p-marco",
        name: "Marco Reyes",
        fte: 1,
        active: true,
        synthetic: false,
        fraction: 1,
        scopeCount: 1,
        switchFactor: 1,
        effectiveFte: 1,
        contextSwitchCostPct: 0,
        allocations: [],
      },
      {
        personId: "p-priya",
        name: "Priya Nair",
        fte: 0.8,
        active: true,
        synthetic: false,
        fraction: 0.5,
        scopeCount: 2,
        switchFactor: 0.88,
        effectiveFte: 0.352,
        contextSwitchCostPct: 12,
        allocations: [],
      },
    ],
    requirements: [
      req("ke-req-0001", REQUIREMENTS.offline, SOURCE_REFS.scopePage, "Field pilot", "2026-08-12T10:00:00.000Z"),
      req("ke-req-0002", REQUIREMENTS.notifications, SOURCE_REFS.scopePage, "Notifications", "2026-08-12T10:00:00.000Z"),
      req("ke-req-0003", REQUIREMENTS.approvals, SOURCE_REFS.scopePage, "Approvals", "2026-08-12T10:00:00.000Z"),
      req("ke-req-0004", REQUIREMENTS.safety, SOURCE_REFS.scopePage, "Safety", "2026-08-12T10:00:00.000Z"),
    ],
    findingCitations: [
      { findingId: "f-notif", snapshotId: SNAP, evidenceIds: ["ke-req-0002"] },
      { findingId: "f-offline", snapshotId: SNAP, evidenceIds: ["ke-req-0001"] },
    ],
    intelligence: {
      objects: [
        intelObject(
          "KE-DEC-0007",
          "decision",
          "Notification batching will default to a fifteen minute window unless a site overrides it.",
          ["ke-ev-0132"],
          "2026-08-19"
        ),
        intelObject(
          "KE-RSK-0042",
          "risk",
          "Unbounded tail risk on approvals: the release window has no slack if approvals slip.",
          ["ke-ev-0311"],
          "2026-08-23"
        ),
        intelObject(
          "KE-RSK-0043",
          "risk",
          "Launch risk from Docufy: the callback contract is unconfirmed and the integration date is a guess.",
          ["ke-ev-0201"],
          "2026-08-21"
        ),
        intelObject(
          "KE-CMT-0019",
          "commitment",
          "Docufy committed to confirming the callback contract by the end of the month.",
          ["ke-ev-0201"],
          "2026-08-21"
        ),
        intelObject(
          "KE-UNK-0004",
          "unknown",
          "Who signs off the safety review before the field pilot?",
          ["ke-ev-0088"],
          "2026-08-14"
        ),
        intelObject(
          "KE-OBS-0042",
          "availability_observation",
          "Two of the four engineers are half allocated to another project this month.",
          ["ke-ev-0290"],
          "2026-08-25"
        ),
        intelObject(
          "KE-DEC-0003",
          "decision",
          "Notifications will be sent immediately with no batching.",
          ["ke-ev-0132"],
          "2026-08-11",
          false
        ),
        intelObject(
          "KE-RSK-0044",
          "risk",
          "Testing capacity for the field pilot is not covered by anyone on the current plan.",
          ["ke-ev-0290"],
          "2026-08-25"
        ),
        intelObject(
          "KE-CMT-0021",
          "commitment",
          "Design will deliver the device flows before the next standup.",
          ["ke-ev-0155"],
          "2026-08-25"
        ),
      ],
      relations: [
        {
          fromKey: `intel:${SNAP}:KE-DEC-0007`,
          toKey: `intel:${SNAP}:KE-DEC-0003`,
          toExternalId: "KE-DEC-0003",
          rel: "supersedes",
          relClass: "temporal",
          declared: {},
        },
        {
          fromKey: `intel:${SNAP}:KE-RSK-0043`,
          toKey: `intel:${SNAP}:KE-CMT-0019`,
          toExternalId: "KE-CMT-0019",
          rel: "related_to",
          relClass: "contextual",
          declared: {},
        },
      ],
      citedPassages: [
        {
          snapshotId: SNAP,
          evidenceId: "ke-ev-0311",
          excerpt: QUOTES.tailRisk,
          sourceRef: SOURCE_REFS.devStandup,
          sourceType: "transcript",
          observedAt: "2026-08-23T14:00:00.000Z",
          role: "evidence",
          status: "active",
          externalRef: null,
          anchor: {},
          independence: null,
        },
        {
          snapshotId: SNAP,
          evidenceId: "ke-ev-0290",
          excerpt: QUOTES.capacity,
          sourceRef: SOURCE_REFS.devStandupEarlier,
          sourceType: "transcript",
          observedAt: "2026-08-11T14:00:00.000Z",
          role: "evidence",
          status: "active",
          externalRef: null,
          anchor: {},
          independence: null,
        },
        {
          snapshotId: SNAP,
          evidenceId: "ke-ev-0402",
          excerpt: QUOTES.blockers,
          sourceRef: SOURCE_REFS.devStandup,
          sourceType: "transcript",
          observedAt: "2026-08-25T14:00:00.000Z",
          role: "evidence",
          status: "active",
          externalRef: null,
          anchor: {},
          independence: null,
        },
      ],
      meta: {
        batchId: "batch-4",
        objectCount: 9,
        currentCount: 8,
        relationCount: 2,
        byType: {},
        byRelClass: {},
        outOfScope: 0,
        scopeTags: {},
        danglingCitations: 0,
      },
    },
  } as unknown as GraphEntityInputs;
}

/** The fixture graph. Built fresh each call, so a mutation in one proof
    cannot leak into the next — the same posture `readRealPackage` takes. */
export function jsaShapedGraph(): AuditGraph {
  return buildAuditGraph({ model: truthModel(), provenance: provenance(), entities: entities() });
}

/**
 * The same fixture, padded to roughly `targetNodes`.
 *
 *   FOR PERFORMANCE MEASUREMENT ONLY. The real JSA graph is around 438 nodes
 *   and this fixture is 61; a query latency measured at 61 says nothing
 *   useful about the instrument people actually use. Padding reproduces the
 *   SIZE, and it does so with the kinds that actually dominate the real
 *   corpus — external objects and evidence passages, which is where the real
 *   package's several hundred nodes are.
 *
 * The padded content is deliberately varied rather than repeated: an index
 * over four hundred copies of one sentence has a vocabulary of a dozen tokens
 * and would measure nothing. Every padded object carries its own number, so
 * the vocabulary grows the way a real corpus's does.
 *
 * Never used for a correctness assertion — the QA matrix runs against the
 * unpadded fixture, whose exact strings this file states.
 */
export function jsaShapedGraphAtScale(targetNodes: number): AuditGraph {
  const base = entities();
  const seed = base.intelligence;
  const objects = [...seed.objects];
  const passages = [...seed.citedPassages];

  // A handful of topic stems, combined with a running number, so padded text
  // is plausible project prose rather than one string repeated.
  const STEMS = [
    "Approval routing for site",
    "Device provisioning batch",
    "Offline sync backlog on route",
    "Notification digest for team",
    "Safety walkthrough for depot",
    "Vendor callback latency on endpoint",
    "Capacity handover for sprint",
    "Release checklist item",
  ];
  const TYPES = ["risk", "decision", "commitment", "unknown", "availability_observation"];

  let n = 0;
  while (objects.length + passages.length + 61 < targetNodes) {
    const stem = STEMS[n % STEMS.length];
    const num = 1000 + n;
    passages.push({
      snapshotId: SNAP,
      evidenceId: `ke-ev-${num}`,
      excerpt: `${stem} ${num} has not been confirmed, and the owner has not been named in the last two reviews.`,
      sourceRef: n % 2 === 0 ? SOURCE_REFS.devStandup : SOURCE_REFS.fieldPilot,
      sourceType: "transcript",
      observedAt: "2026-08-25T14:00:00.000Z",
      role: "evidence",
      status: "active",
      externalRef: null,
      anchor: {},
      independence: null,
    } as (typeof seed.citedPassages)[number]);
    objects.push({
      snapshotId: SNAP,
      externalId: `KE-PAD-${num}`,
      intelligenceType: TYPES[n % TYPES.length],
      trust: "external_unverified",
      statement: `${stem} ${num} is outstanding and blocks the review it belongs to.`,
      statementBasis: "verbatim",
      status: "open",
      isCurrent: true,
      observedDate: "2026-08-25",
      dates: {},
      scope: ["jsa"],
      evidenceRefs: [`ke-ev-${num}`],
      fields: {},
      provenance: {},
      extra: {},
    } as (typeof seed.objects)[number]);
    n++;
  }

  return buildAuditGraph({
    model: truthModel(),
    provenance: provenance(),
    entities: { ...base, intelligence: { ...seed, objects, citedPassages: passages } },
  });
}
