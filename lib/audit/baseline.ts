import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  auditChangeFingerprint,
  defaultTargetHref,
  type AuditChangeCategory,
  type AuditChangeDraft,
  type ChangeEvidence,
  type ProposedOwnerMutation,
} from "./changeContract";

const BASELINES = {
  cmrpatpkv0000ov1ylif2k088: {
    name: "JSA",
    snapshotId: "cmtu8ppmk0003l21y8933nijc",
    packageId: "hermes-si-0b95c9006c75fa4fa86931fb151eb7c55cee9442",
  },
  cmsnchj1g0001pl1y7odyjqsc: {
    name: "iTrack",
    snapshotId: "cmtu8pp5o0001l21ykss4dtl4",
    packageId: "hermes-si-557be2140577ebced2e0e698913b0c41237fe980",
  },
} as const;

type BaselineScopeId = keyof typeof BASELINES;

interface BaselineDefinition {
  key: string;
  category: AuditChangeCategory;
  owner: string;
  changeType: string;
  title: string;
  summary: string;
  why: string;
  current: Record<string, unknown>;
  proposed: ProposedOwnerMutation;
  needles: string[];
  recommended: string;
  completion?: string[];
  initialStatus?: AuditChangeDraft["initialStatus"];
  forecastEffect?: Record<string, unknown> | null;
}

const jsa: BaselineDefinition[] = [
  {
    key: "beta-2026-09-08-occurred", category: "milestone", owner: "timeline", changeType: "occurred_milestone",
    title: "JSA beta occurred September 8", summary: "Record the real beta day as an occurred milestone.",
    why: "The September 8 standup calls it beta day and describes validating access to the live beta group.",
    current: { milestone: "not represented" },
    proposed: { action: "create_milestone", title: "JSA beta", date: "2026-09-08", temporalState: "occurred", semanticState: "occurred", kind: "milestone" },
    needles: ["beta day", "everyone who's in beta has access"], recommended: "accept",
  },
  {
    key: "expanded-stky-controls-cut", category: "scope", owner: "scope", changeType: "capability_removed",
    title: "Expanded STKY controls were cut", summary: "Represent the expanded control-selection flow as removed from the current release.",
    why: "Current structured intelligence records the extended STKY controls as cut, alongside a still-open communication action to Cam and Jake.",
    current: { capability: "not reconciled" },
    proposed: { action: "upsert_capability", name: "Expanded STKY control flows", status: "removed", description: "Cut from the current JSA release; retain as historical scope, not active work." },
    needles: ["extended STKY control flows are cut", "extended controls"], recommended: "accept",
    forecastEffect: { deterministic: false, effect: "Scope owner changes; Forecast will recompute from represented work." },
  },
  {
    key: "crew-ack-optional", category: "scope", owner: "scope", changeType: "capability_changed",
    title: "Crew acknowledgment is optional and non-blocking", summary: "Keep acknowledgment as an experiment after approval; never gate work on it.",
    why: "The current Decision intelligence explicitly says crew are notified and may acknowledge, but work is never blocked.",
    current: { behavior: "unreconciled" },
    proposed: { action: "upsert_capability", name: "Crew acknowledgment", status: "accepted", description: "Optional, explicitly non-blocking after approval; collect usage data." },
    needles: ["optional, explicitly non-blocking experiment", "work is never gated"], recommended: "accept",
  },
  {
    key: "midday-change-cut", category: "scope", owner: "scope", changeType: "capability_removed",
    title: "Midday-change flow is outside the current release", summary: "Propose removing the midday employee-add/change flow with the rest of the extended control package.",
    why: "The evidence groups midday change with extended controls and mandatory acknowledgment, but this acceptance still needs Nic's confirmation.",
    current: { capability: "uncertain" },
    proposed: { action: "upsert_capability", name: "Midday JSA change flow", status: "removed", description: "Outside the current JSA release." },
    needles: ["midday change", "one package"], recommended: "confirm",
    completion: ["Confirm that midday-change is outside the current release."],
  },
  {
    key: "arc-angel-boundary", category: "scope", owner: "scope", changeType: "capability_changed",
    title: "Arc-Angel is advisory and non-blocking", summary: "Seat the high-level boundary while leaving the unwritten requirements and API schemas visible.",
    why: "Current intelligence describes a finite suggestion service in existing info boxes, not a chatbot or task generator.",
    current: { capability: "candidate" },
    proposed: { action: "upsert_capability", name: "Arc-Angel JSA guidance", status: "accepted", description: "Advisory, non-blocking safety suggestions inside existing information boxes; detailed requirements remain open." },
    needles: ["advisory only, non-blocking", "minimal web service"], recommended: "edit_accept",
  },
  {
    key: "roles-it-portal", category: "decision", owner: "decisions", changeType: "create_open_decision",
    title: "What roles and IT Portal access model belongs in JSA V1?", summary: "Create the unresolved access/roles question without inventing an answer or a gate.",
    why: "The refresh found unresolved access-pattern and role work that belongs in Decisions, not inferred staffing or Scope.",
    current: { decision: "not represented" },
    proposed: { action: "create_open_decision", title: "What roles and IT Portal access model belongs in JSA V1?", rationale: "Confirm the V1 roles, access boundaries, and IT Portal handoff." },
    needles: ["access", "roles"], recommended: "confirm", completion: ["Confirm this question is still unresolved."],
  },
  ...[
    ["offline", "Offline support", "offline"],
    ["notifications", "JSA notifications", "notifications"],
    ["approvals", "Submission and job-lead approvals", "approval"],
    ["photo-upload", "Photo upload", "photo"],
    ["pdf", "PDF / Docufy output", "PDF"],
  ].map(([key, title, needle]): BaselineDefinition => ({
    key: `post-beta-${key}`, category: "scope", owner: "scope", changeType: "capability_added",
    title: `${title} is a post-beta V1 candidate`, summary: `Review ${title.toLowerCase()} independently instead of accepting one bundled post-beta scope change.`,
    why: "The beta acceptance criteria separated these items from the September 8 cut and placed them in JSA V1.",
    current: { capability: "not represented" },
    proposed: { action: "upsert_capability", name: title, status: "planned", description: "Post-beta JSA V1 candidate; accepted independently through Audit." },
    needles: [needle, "NOT Beta requirements"], recommended: "review",
  })),
  {
    key: "retire-synthetic-test-decision", category: "decision", owner: "decisions", changeType: "retire_synthetic_decision",
    title: "Retire the synthetic Test Decision and gate", summary: "Dismiss the known synthetic Decision; its attached gate remains historical and no longer participates in active Forecast input.",
    why: "The reconciliation verified this as test data rather than project truth.", current: { decision: "synthetic test row" },
    proposed: { action: "dismiss_decision_by_title", titlePattern: "Test Decision", dismissReason: "Retired as synthetic test data during governed reconciliation." },
    needles: ["test decision"], recommended: "retire", forecastEffect: { deterministic: true, effect: "If its gate is open, dismissal removes that gate from Forecast input." },
  },
];

const itrack: BaselineDefinition[] = [
  {
    key: "quality-provision-only", category: "scope", owner: "scope", changeType: "capability_changed",
    title: "iTrack Quality is provision-only for Rev 1", summary: "Represent Quality as provisioned for, not built in Rev 1.",
    why: "Current Decision intelligence resolves the earlier scope ambiguity: provision for Quality without building the Quality workflow.",
    current: { capability: "unreconciled" },
    proposed: { action: "upsert_capability", name: "iTrack Quality", status: "provision_only", description: "Rev 1 provisions for Quality but does not build the Quality workflow." },
    needles: ["provisioned for, not built", "Quality"], recommended: "accept",
  },
  {
    key: "system-derived-severity", category: "decision", owner: "decisions", changeType: "create_decided_decision",
    title: "How is incident severity determined in iTrack Rev 1?", summary: "Supersede reporter-selected severity with system-derived severity.",
    why: "The later stakeholder decision replaces the August 31 simple reporter-selected model.",
    current: { decision: "Reporter self-selects severity" },
    proposed: { action: "create_decided_decision", title: "How is incident severity determined in iTrack Rev 1?", resolution: "Severity is derived by the system from incident answers, not directly selected by the reporter.", chosenOption: "system-derived" },
    needles: ["system-derived severity", "reporter self-selects"], recommended: "accept",
  },
  ...[
    ["notification-trigger", "What event or severity triggers each iTrack notification?", "notifications should key off severity"],
    ["charter-routing", "Who belongs in the named iTrack investigation charter group?", "named charter group"],
    ["notification-channels", "Which channels should iTrack Rev 1 notifications use?", "send them all three"],
  ].map(([key, title, needle]): BaselineDefinition => ({
    key, category: "decision", owner: "decisions", changeType: "create_open_decision", title,
    summary: "Review this notification dimension independently; do not bundle trigger, routing, and channel semantics.",
    why: "The reconciliation separated three different choices that had been described together.",
    current: { decision: "not separately represented" },
    proposed: { action: "create_open_decision", title, rationale: "Separated from the September 2 notification discussion for governed review." },
    needles: [needle], recommended: "review",
  })),
  {
    key: "cam-colton-investigation", category: "decision", owner: "decisions", changeType: "create_open_decision",
    title: "What investigation capability belongs in iTrack Rev 1?", summary: "Preserve two current directions as an unresolved organizational Decision.",
    why: "Cam requires some Rev-1 investigation capability; Colton directed a substantially as-is rebuild with minimal differences. Neither source reconciles the other.",
    current: { decision: "unrepresented contradiction" },
    proposed: {
      action: "create_open_decision", title: "What investigation capability belongs in iTrack Rev 1?",
      rationale: "Two current organizational directions remain unresolved.",
      options: [
        { id: "rebuild-as-is", label: "Rebuild substantially as-is / minimal differences" },
        { id: "rev1-investigation", label: "Include some Rev-1 investigation capability" },
      ],
    },
    needles: ["some form of investigation tool", "rebuild iTrack as is"], recommended: "accept",
  },
  {
    key: "kaizen-2026-10-02", category: "milestone", owner: "timeline", changeType: "planned_milestone",
    title: "iTrack Quality Kaizen planned for October 2", summary: "Record the scheduled Kaizen as planned, not occurred or committed delivery.",
    why: "The September 8 planning session resolved the Kaizen date as October 2.", current: { milestone: "not represented" },
    proposed: { action: "create_milestone", title: "iTrack Quality Kaizen", date: "2026-10-02", temporalState: "planned", semanticState: "planned", kind: "milestone" },
    needles: ["Kaizen", "2026-10-02"], recommended: "accept",
  },
  {
    key: "target-2026-10-31", category: "scope", owner: "scope", changeType: "target_changed",
    title: "Confirm the October 31 iTrack Rev 1 target", summary: "Set a target only after Nic confirms which iTrack scope the date governs.",
    why: "The evidence distinguishes iTrack safety/2.0 from Quality and explicitly says Quality has no committed date.",
    current: { targetDate: "unreconciled" },
    proposed: { action: "update_target_date", targetDate: "2026-10-31" },
    needles: ["Oct 31 commitment applies to iTrack 2.0", "not to iTrack Quality"], recommended: "confirm",
    completion: ["Confirm October 31 applies to iTrack Rev 1 safety and is a target, not a commitment."],
    forecastEffect: { deterministic: true, effect: "Forecast confidence-at-target will recompute against October 31." },
  },
  {
    key: "level-one-flow-dependency", category: "dependency", owner: "dependencies", changeType: "dependency_candidate",
    title: "Defer the Level-1 flow/design dependency", summary: "Keep this outside canonical dependency truth until current prerequisite evidence identifies both endpoints.",
    why: "The reconciliation found the older dependency claim but not enough current causal evidence to seat it safely.",
    current: { dependency: "unproven" }, proposed: { action: "create_dependency" }, needles: ["Level-1 flow", "Lucy"],
    recommended: "defer", initialStatus: "deferred", completion: ["Identify upstream and downstream Scope endpoints.", "Attach current causal or prerequisite evidence."],
  },
  {
    key: "retire-address-storage-test", category: "decision", owner: "decisions", changeType: "retire_synthetic_decision",
    title: "Retire the synthetic address-storage Decision and gate", summary: "Dismiss the known synthetic test Decision without deleting its audit history.",
    why: "The reconciliation verified the address-storage row and gate as test data.", current: { decision: "synthetic test row" },
    proposed: { action: "dismiss_decision_by_title", titlePattern: "address", dismissReason: "Retired as synthetic test data during governed reconciliation." },
    needles: ["address"], recommended: "retire", forecastEffect: { deterministic: true, effect: "If its gate is open, dismissal removes that gate from Forecast input." },
  },
];

function setupDefinitions(project: string): BaselineDefinition[] {
  return [
    {
      key: "setup-linear", category: "source_health", owner: "source_configuration", changeType: "execution_mapping",
      title: `Repair or confirm ${project} Linear mapping`, summary: "Linear currently returns zero in-scope issues; verify mapping before trusting execution-derived Forecast.",
      why: "This is source configuration, not a product Decision.", current: { linear: "zero current issues / mapping suspect" }, proposed: { action: "open_source_settings", provider: "linear" },
      needles: ["Linear"], recommended: "review", completion: ["Confirm team and project mapping against current Linear."],
    },
    {
      key: "setup-notion", category: "source_health", owner: "source_configuration", changeType: "source_unconfigured",
      title: `Configure governing Notion references for ${project}`, summary: "No governing Notion references are configured.", why: "Missing source setup must not become Scope or Decision truth.",
      current: { notion: "unconfigured" }, proposed: { action: "open_source_settings", provider: "notion" }, needles: ["notion"], recommended: "review",
    },
    {
      key: "setup-figma", category: "source_health", owner: "source_configuration", changeType: "source_unconfigured",
      title: `Configure governing Figma references for ${project}`, summary: "No governing Figma references are configured.", why: "Missing design-source setup is an integration health issue.",
      current: { figma: "unconfigured" }, proposed: { action: "open_source_settings", provider: "figma" }, needles: ["figma"], recommended: "review",
    },
    {
      key: "setup-capacity", category: "capacity", owner: "capacity", changeType: "capacity_unreconciled",
      title: `Reconcile named capacity for ${project}`, summary: "Person mentions remain evidence only; actual allocations have not been confirmed.", why: "Knowledge mentions never become staffing automatically.",
      current: { capacity: "unreconciled" }, proposed: { action: "open_capacity" }, needles: ["capacity"], recommended: "review",
    },
  ];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function extractEvidence(pkgValue: unknown, needles: string[]): ChangeEvidence[] {
  const pkg = record(pkgValue);
  const evidenceRows = Array.isArray(pkg.evidence) ? pkg.evidence.map(record) : [];
  const evidenceById = new Map(evidenceRows.map((item) => [String(item.id ?? ""), item]));
  const tokens = needles.map((item) => item.toLowerCase()).filter(Boolean);
  const scored: { score: number; item: ChangeEvidence }[] = [];
  for (const item of evidenceRows) {
    const excerpt = typeof item.excerpt === "string" ? item.excerpt : "";
    const lower = excerpt.toLowerCase();
    const score = tokens.filter((token) => lower.includes(token)).length;
    if (score > 0 && excerpt) scored.push({ score, item: { id: String(item.id), excerpt, sourceRef: typeof item.sourceRef === "string" ? item.sourceRef : null, observedAt: typeof item.observedAt === "string" ? item.observedAt : null, kind: "evidence" } });
  }
  for (const raw of Array.isArray(pkg.intelligenceObjects) ? pkg.intelligenceObjects.map(record) : []) {
    const excerpt = typeof raw.statement === "string" ? raw.statement : "";
    const lower = excerpt.toLowerCase();
    const score = tokens.filter((token) => lower.includes(token)).length;
    if (!score || !excerpt) continue;
    const refs = Array.isArray(raw.evidenceRefs) ? raw.evidenceRefs.filter((item): item is string => typeof item === "string") : [];
    scored.push({ score: score + 0.25, item: { id: String(raw.id ?? refs[0] ?? "intelligence"), excerpt, sourceRef: refs[0] ? String(evidenceById.get(refs[0])?.sourceRef ?? "") : null, observedAt: typeof raw.observedDate === "string" ? raw.observedDate : null, kind: "intelligence" } });
  }
  const seen = new Set<string>();
  return scored.sort((a, b) => b.score - a.score).map((item) => item.item).filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id))).slice(0, 3);
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function ensureReconciliationBaseline(scopeId: string): Promise<{ seeded: number; available: boolean }> {
  const baseline = BASELINES[scopeId as BaselineScopeId];
  if (!baseline) return { seeded: 0, available: false };
  const snapshot = await prisma.contextSnapshot.findFirst({
    where: { OR: [{ id: baseline.snapshotId }, { scopeId, packageId: { contains: baseline.packageId } }] },
    orderBy: { createdAt: "desc" },
  });
  if (!snapshot) return { seeded: 0, available: false };
  const audit = await prisma.auditRun.findFirst({ where: { contextSnapshotId: snapshot.id }, orderBy: { createdAt: "desc" } });
  const definitions = [...(baseline.name === "JSA" ? jsa : itrack), ...setupDefinitions(baseline.name)];
  let seeded = 0;
  for (const definition of definitions) {
    const draft: AuditChangeDraft = {
      key: `baseline:${baseline.name.toLowerCase()}:${definition.key}`,
      scopeId, auditRunId: audit?.id ?? null, contextSnapshotId: snapshot.id,
      category: definition.category, owner: definition.owner, changeType: definition.changeType,
      title: definition.title, summary: definition.summary, whyProposed: definition.why,
      currentState: definition.current, proposedState: definition.proposed,
      evidence: extractEvidence(snapshot.package, definition.needles), currentness: "current",
      retrievalBasis: "Verified September 9 reconciliation over the completed 40-transcript Hermes package",
      retrievalConfidence: "strong", forecastEffect: definition.forecastEffect,
      relevanceClass: "project_local", relevanceReason: `Verified as ${baseline.name}-local during the completed reconciliation.`,
      sourceKind: definition.category === "source_health" || definition.category === "capacity" ? "setup" : "baseline",
      recommendedAction: definition.recommended, targetHref: defaultTargetHref(definition.owner, scopeId),
      completionRequirements: definition.completion ?? [], initialStatus: definition.initialStatus,
    };
    const fingerprint = auditChangeFingerprint(draft);
    const existing = await prisma.auditChangeProposal.findUnique({ where: { fingerprint }, select: { id: true } });
    if (existing) continue;
    await prisma.auditChangeProposal.create({ data: {
      scopeId, auditRunId: draft.auditRunId, contextSnapshotId: snapshot.id, fingerprint, sourceKey: draft.key,
      category: draft.category, owner: draft.owner, changeType: draft.changeType,
      title: draft.title, summary: draft.summary, whyProposed: draft.whyProposed,
      currentState: json(draft.currentState), proposedState: json(draft.proposedState), evidence: json(draft.evidence),
      currentness: draft.currentness, retrievalBasis: draft.retrievalBasis, retrievalConfidence: draft.retrievalConfidence,
      forecastEffect: draft.forecastEffect ? json(draft.forecastEffect) : undefined,
      relevanceClass: draft.relevanceClass, relevanceReason: draft.relevanceReason, sourceKind: draft.sourceKind,
      recommendedAction: draft.recommendedAction, targetHref: draft.targetHref,
      completionRequirements: json(draft.completionRequirements ?? []), status: draft.initialStatus ?? "pending",
    } });
    seeded += 1;
  }
  return { seeded, available: true };
}

export const reconciliationBaselineMetadata = BASELINES;
