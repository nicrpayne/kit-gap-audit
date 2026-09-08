import type { Currentness, DecisionBriefV1, SourceStamp, TemporalRole, TruthOwner } from "./decisionBrief";
import { briefPayloadFingerprint } from "./decisionBriefRender";
import {
  AUDIENCE_LABELS,
  INTERACTIVE_BRIEF_BUNDLE_VERSION,
  PURPOSE_LABELS,
  moduleDefinition,
  normalizeBriefRecipe,
  type AudienceLens,
  type BriefModuleId,
  type BriefPurpose,
  type BriefRecipeV1,
  type ModuleDensity,
} from "./composer";
import { buildBriefPresentation, sourceForModule, type BriefPresentationV1 } from "./presentation";

export const CHATGPT_SITES_HANDOFF_VERSION = "chatgpt-sites-handoff.v1" as const;
export const CHATGPT_SITES_URL = "https://chatgpt.com/sites" as const;

export type PublicationStatus =
  | "bundle_ready"
  | "handoff_opened"
  | "draft_generated"
  | "previewed"
  | "published_shared"
  | "failed";

export interface PublicationProvenance {
  field: string;
  owner: TruthOwner;
  asOf: string;
  currentness: Currentness;
  temporalRole: TemporalRole;
  grounding: "owner_read" | "frozen_comparison" | "presentation_only";
  note: string | null;
}

export interface PublicationReference {
  referenceId: string;
  label: string;
  owner: TruthOwner;
  currentness: Currentness;
  grounding: "passage" | "source_only" | "none" | "owner_read";
  access: "trace_in_signal";
  href: null;
}

export interface PublicationExclusion {
  category: "secret" | "private_source" | "live_access" | "internal_identifier" | "hidden_module";
  label: string;
  reason: string;
}

export interface InteractiveBriefBundleV1 {
  version: typeof INTERACTIVE_BRIEF_BUNDLE_VERSION;
  handoffVersion: typeof CHATGPT_SITES_HANDOFF_VERSION;
  identity: {
    reportId: string;
    projectId: string;
    projectName: string;
    audience: AudienceLens;
    audienceLabel: string;
    purpose: BriefPurpose;
    purposeLabel: string;
    generatedAt: string;
    asOf: string;
    mode: "reality" | "scenario";
    compareTo: string | null;
  };
  integrity: {
    snapshotFingerprint: string;
    bundleHash: string;
    hashAlgorithm: "sha256";
  };
  content: {
    outcome: string;
    delivery: {
      status: "available" | "unavailable";
      likely: string | null;
      earliest: string | null;
      latest: string | null;
      target: string | null;
      confidenceAtTarget: number | null;
      commitment: { status: "recorded" | "missing"; date: string | null; label: string };
      unavailableReason: string | null;
    };
    whyThisDate: Omit<BriefPresentationV1["drivers"][number], "href">[];
    whatChanged: {
      newFindingCount: number;
      resolvedFindingCount: number;
      shippedCount: number;
      newFindingTitles: string[];
      shippedTitles: string[];
    } | null;
    decisions: {
      id: string;
      title: string;
      owner: string | null;
      neededBy: string | null;
      gated: boolean;
      modeledDelay: { low: number; likely: number; high: number };
    }[];
    leadershipAsks: Omit<BriefPresentationV1["leadershipAsks"][number], "href">[];
    scope: {
      executableItemCount: number;
      remainingEffortDays: { low: number; likely: number; high: number };
    } | null;
    dependencies: { name: string; likelyDate: string | null; currentness: Currentness }[];
    capacity: {
      availability: "available" | "missing" | "unavailable";
      namedRawFte: number | null;
      namedEffectiveFte: number | null;
      forecastEffectiveFte: number;
      contextSwitchCostPct: number;
      contributorCount: number;
      contributors: { name: string; rawFte: number; effectiveFte: number }[];
      absenceLabel: string | null;
    } | null;
    milestones: { id: string; title: string; date: string; endDate: string | null; temporalState: "occurred" | "planned" }[];
    next: { title: string; date: string } | null;
    findings: { title: string; severity: string; status: string }[];
    caveats: { code: string; message: string }[];
    scenarioCompare: {
      frozen: true;
      scenarioId: string | null;
      options: { id: string; label: string; likelyDate: string; deltaDays: number; confidenceAtTarget: number | null }[];
    } | null;
  };
  provenance: PublicationProvenance[];
  references: PublicationReference[];
  permissions: {
    publicationContentOnly: true;
    permittedSourceExcerpts: "none_marked_shareable";
    liveSignalAccess: false;
    liveQueryAuthority: false;
    mutationCapability: false;
    credentialsIncluded: false;
    silentRefreshAllowed: false;
    publishAuthorized: false;
  };
  presentation: {
    moduleOrder: { id: BriefModuleId; label: string; density: ModuleDensity }[];
    audienceLanguage: string;
    allowedInteractions: ("module_navigation" | "expand_collapse" | "source_trace" | "milestone_exploration" | "frozen_scenario_compare")[];
    visualHierarchy: string[];
  };
  exclusions: PublicationExclusion[];
}

export type UnsealedInteractiveBriefBundleV1 = Omit<InteractiveBriefBundleV1, "integrity"> & {
  integrity: Omit<InteractiveBriefBundleV1["integrity"], "bundleHash">;
};

const hasModule = (recipe: BriefRecipeV1, ...ids: BriefModuleId[]) => ids.some((id) => recipe.modules.some((item) => item.id === id));

function cleanDriver(driver: BriefPresentationV1["drivers"][number]) {
  return { id: driver.id, family: driver.family, label: driver.label, detail: driver.detail, owner: driver.owner };
}

function provenance(field: string, stamp: SourceStamp, grounding: PublicationProvenance["grounding"] = "owner_read"): PublicationProvenance {
  return {
    field,
    owner: stamp.owner,
    asOf: stamp.asOf,
    currentness: stamp.currentness,
    temporalRole: stamp.temporalRole,
    grounding,
    note: stamp.note ?? null,
  };
}

function publicationReferences(brief: DecisionBriefV1, recipe: BriefRecipeV1): PublicationReference[] {
  if (recipe.audience === "stakeholder-partner" || !hasModule(recipe, "evidence", "audit-delta", "source-health")) return [];
  return brief.evidence.references.value.map((item, index) => ({
    referenceId: `evidence-${index + 1}`,
    label: item.title,
    owner: "Audit" as const,
    currentness: item.currentness,
    grounding: item.grounding,
    access: "trace_in_signal" as const,
    href: null,
  }));
}

export function buildInteractiveBriefBundleDraft(reportId: string, brief: DecisionBriefV1, inputRecipe: unknown): UnsealedInteractiveBriefBundleV1 {
  const recipe = normalizeBriefRecipe(inputRecipe, brief);
  const presentation = buildBriefPresentation(brief, recipe);
  const fingerprint = briefPayloadFingerprint(brief);
  const forecastUnavailable = brief.caveats.value.find((item) => item.code === "FORECAST_UNAVAILABLE");
  const external = recipe.audience === "stakeholder-partner";
  const window = brief.headline.likelyWindow.value;
  const enabled = new Set(recipe.modules.map((item) => item.id));
  // Why This Date is a composed module whose published drivers include the
  // executable-work and capacity facts. Carry those exact supporting values
  // whenever that module is enabled so the Site can reconcile the claim.
  const scopeEnabled = enabled.has("scope") || enabled.has("why-this-date");
  const capacityEnabled = enabled.has("capacity") || enabled.has("why-this-date");
  const timelineEnabled = enabled.has("timeline") || enabled.has("next") || enabled.has("commitment");
  // A historical report comparison travels through What Changed / Movement.
  // Scenario options are exposed only when the frozen brief itself is a
  // Scenario; a prior-report id must never unlock scenario affordances.
  const compareEnabled = brief.identity.mode === "scenario";
  const references = publicationReferences(brief, recipe);
  const exclusions: PublicationExclusion[] = [
    { category: "secret", label: "Credentials and connector tokens", reason: "Never part of a publication bundle." },
    { category: "live_access", label: "Signal sessions, APIs and write actions", reason: "The Site is a frozen, read-only artifact." },
    { category: "internal_identifier", label: "Owner source IDs, context snapshot IDs and raw evidence passage IDs", reason: "Not marked publication-safe by the source owner." },
    { category: "private_source", label: "Raw source excerpts", reason: "No source excerpt in DecisionBriefV1 is explicitly marked shareable." },
    ...(!external ? [] : [{ category: "private_source" as const, label: "Finding and source-reference titles", reason: "Stakeholder/Partner bundles fail closed to counts unless material is explicitly marked shareable." }]),
    ...recipe.modules.length === 0 ? [{ category: "hidden_module" as const, label: "All report modules", reason: "No modules were enabled." }] : [],
  ];
  const sourceStamps = new Map<string, PublicationProvenance>();
  const add = (field: string, stamp: SourceStamp, grounding?: PublicationProvenance["grounding"]) => sourceStamps.set(field, provenance(field, stamp, grounding));
  add("content.delivery", brief.headline.likelyWindow.source);
  add("content.delivery.target", brief.headline.targetDate.source);
  add("content.delivery.commitment", presentation.commitment.source);
  if (enabled.has("why-this-date")) add("content.whyThisDate", sourceForModule(brief, "why-this-date"));
  if (enabled.has("what-changed") || enabled.has("movement")) add("content.whatChanged", brief.changes.audit.source, "frozen_comparison");
  if (enabled.has("decisions") || enabled.has("leadership-asks")) add("content.decisions", brief.calls.decisions.source);
  if (enabled.has("dependencies")) add("content.dependencies", brief.calls.dependencies.source);
  if (scopeEnabled && !forecastUnavailable) add("content.scope", brief.movable.scope.source);
  if (capacityEnabled) add("content.capacity", brief.movable.capacity.source);
  if (timelineEnabled) add("content.milestones", brief.timeline.nextMilestone.source);
  if (enabled.has("audit-delta") || enabled.has("evidence")) add("content.findings", brief.evidence.references.source);
  if (enabled.has("caveats")) add("content.caveats", brief.caveats.source);
  add("content.outcome", { owner: "ReportHistory", asOf: brief.identity.generatedAt, currentness: "current", temporalRole: "historical", sourceId: fingerprint, note: "Deterministic presentation over the frozen snapshot." }, "presentation_only");

  const nextMilestone = brief.timeline.nextMilestone.value;
  const milestones = timelineEnabled
    ? [nextMilestone, ...brief.timeline.conflicts.value].filter((item): item is NonNullable<typeof item> => !!item).map((item) => ({ id: item.id, title: item.title, date: item.date, endDate: item.endDate, temporalState: item.temporalState }))
    : [];
  const capacity = brief.movable.capacity.value;
  const content = {
    outcome: forecastUnavailable
      ? `Forecast unavailable — ${forecastUnavailable.message}`
      : presentation.signalRead,
    delivery: forecastUnavailable ? {
      status: "unavailable" as const,
      likely: null,
      earliest: null,
      latest: null,
      target: brief.headline.targetDate.value,
      confidenceAtTarget: null,
      commitment: { status: presentation.commitment.status, date: presentation.commitment.date, label: presentation.commitment.label },
      unavailableReason: forecastUnavailable.message,
    } : {
      status: "available" as const,
      likely: window.likely,
      earliest: window.earliest,
      latest: window.latest,
      target: brief.headline.targetDate.value,
      confidenceAtTarget: brief.headline.confidenceAtTarget.value,
      commitment: { status: presentation.commitment.status, date: presentation.commitment.date, label: presentation.commitment.label },
      unavailableReason: null,
    },
    whyThisDate: enabled.has("why-this-date") && !forecastUnavailable ? presentation.drivers.map(cleanDriver) : [],
    whatChanged: hasModule(recipe, "what-changed", "movement") ? {
      newFindingCount: brief.changes.audit.value.newFindings.length,
      resolvedFindingCount: brief.changes.audit.value.resolvedFindings.length,
      shippedCount: brief.changes.delivery.value.shipped.length,
      newFindingTitles: external ? [] : brief.changes.audit.value.newFindings.map((item) => item.title),
      shippedTitles: brief.changes.delivery.value.shipped.map((item) => `${item.identifier} · ${item.title}`),
    } : null,
    decisions: hasModule(recipe, "decisions", "leadership-asks") ? brief.calls.decisions.value.map((item) => ({
      id: item.id,
      title: item.title,
      owner: item.owner,
      neededBy: item.neededBy,
      gated: item.gated,
      modeledDelay: item.modeledDelay,
    })) : [],
    leadershipAsks: enabled.has("leadership-asks") ? presentation.leadershipAsks.map((item) => ({ id: item.id, label: item.label, owner: item.owner, neededBy: item.neededBy, gated: item.gated, confirmed: item.confirmed })) : [],
    scope: scopeEnabled && !forecastUnavailable ? { executableItemCount: brief.movable.scope.value.executableItemCount, remainingEffortDays: brief.movable.scope.value.remainingEffortDays } : null,
    dependencies: enabled.has("dependencies") ? brief.calls.dependencies.value.map((item) => ({ name: item.name, likelyDate: item.likelyDate, currentness: item.currentness })) : [],
    capacity: capacityEnabled ? {
      availability: capacity.availability,
      namedRawFte: capacity.namedRawFte,
      namedEffectiveFte: capacity.namedEffectiveFte,
      forecastEffectiveFte: capacity.forecastEffectiveFte,
      contextSwitchCostPct: capacity.contextSwitchCostPct,
      contributorCount: capacity.contributors.length,
      contributors: capacity.availability === "available" ? capacity.contributors.map((item) => ({ name: item.name, rawFte: item.rawFte, effectiveFte: item.effectiveFte })) : [],
      absenceLabel: capacity.availability === "available" ? null : "Named staffing not configured",
    } : null,
    milestones,
    next: enabled.has("next") && nextMilestone ? { title: nextMilestone.title, date: nextMilestone.date } : null,
    findings: enabled.has("audit-delta") && !external ? brief.changes.audit.value.newFindings.map((item) => ({ title: item.title, severity: item.severity, status: item.status })) : [],
    caveats: enabled.has("caveats") || forecastUnavailable ? brief.caveats.value : [],
    scenarioCompare: compareEnabled ? { frozen: true as const, scenarioId: brief.identity.scenarioId, options: brief.movable.scenarioOptions.value } : null,
  };

  return {
    version: INTERACTIVE_BRIEF_BUNDLE_VERSION,
    handoffVersion: CHATGPT_SITES_HANDOFF_VERSION,
    identity: {
      reportId,
      projectId: brief.identity.project.value.id,
      projectName: brief.identity.project.value.name,
      audience: recipe.audience,
      audienceLabel: AUDIENCE_LABELS[recipe.audience],
      purpose: recipe.purpose,
      purposeLabel: PURPOSE_LABELS[recipe.purpose],
      generatedAt: brief.identity.generatedAt,
      asOf: brief.headline.likelyWindow.source.asOf,
      mode: brief.identity.mode,
      compareTo: recipe.compareTo,
    },
    integrity: { snapshotFingerprint: fingerprint, hashAlgorithm: "sha256" },
    content,
    provenance: [...sourceStamps.values()],
    references,
    permissions: {
      publicationContentOnly: true,
      permittedSourceExcerpts: "none_marked_shareable",
      liveSignalAccess: false,
      liveQueryAuthority: false,
      mutationCapability: false,
      credentialsIncluded: false,
      silentRefreshAllowed: false,
      publishAuthorized: false,
    },
    presentation: {
      moduleOrder: recipe.modules.map((item) => ({ ...item, label: moduleDefinition(item.id).label })),
      audienceLanguage: `${AUDIENCE_LABELS[recipe.audience]} · ${PURPOSE_LABELS[recipe.purpose]}`,
      allowedInteractions: [
        "module_navigation",
        "expand_collapse",
        ...(references.length ? ["source_trace" as const] : []),
        ...(milestones.length ? ["milestone_exploration" as const] : []),
        ...(compareEnabled ? ["frozen_scenario_compare" as const] : []),
      ],
      visualHierarchy: ["delivery outcome", "why this date", "changeable drivers", "commitment boundary", "changes and asks", "next"],
    },
    exclusions,
  };
}

export function siteHandoffPrompt(bundle: InteractiveBriefBundleV1): string {
  const modules = bundle.presentation.moduleOrder.map((item) => `${item.label} (${item.density})`).join(", ");
  return `Use @Sites to create a private, recipient-facing interactive project brief website from the attached ${bundle.version} JSON.\n\nAudience: ${bundle.identity.audienceLabel}\nPurpose: ${bundle.identity.purposeLabel}\nProject: ${bundle.identity.projectName}\nFrozen report: ${bundle.identity.reportId}\nSnapshot: ${bundle.integrity.snapshotFingerprint}\nBundle SHA-256: ${bundle.integrity.bundleHash}\nModules, in order: ${modules}\n\nTruth contract — mandatory:\n- Use only facts present in the bundle. Do not discover, browse for, infer, or refresh project facts.\n- Do not connect to Signal, call Signal APIs, add credentials, or create any mutation path back to Signal.\n- Keep LIKELY, TARGET, and COMMITTED visibly distinct. Never turn likely or target into a commitment.\n- If commitment.status is missing, say “No canonical delivery commitment.”\n- Keep every missing-data, unavailable, stale, unreconciled, and grounding caveat visible where material.\n- AI-written narrative is presentation only; it is not new project truth.\n- Show provenance only from bundle.provenance and references. Do not expose excluded or internal-only identifiers.\n- Implement only interactions listed in presentation.allowedInteractions. Scenario comparison is frozen and read-only.\n\nProduct and safety contract:\n- The Site should feel like a calm finished executive/product brief, not like Signal and not like a DAW.\n- Make the first viewport answer: when, why, what can change, what is committed, what changed, what is needed, and what is next.\n- No forms, analytics, persistent storage, authentication, live queries, or external data sources.\n- Keep the Site private for review. Save a reviewable version and return a private preview.\n- Do not deploy, publish, share, change access, invite anyone, or contact anyone without explicit operator approval after preview.\n\nBefore returning the preview, reconcile every displayed number, date, decision, ask, milestone, status, and caveat to the bundle and report any mismatch.`;
}
