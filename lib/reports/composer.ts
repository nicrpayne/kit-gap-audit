import type { BriefMode, DecisionBriefV1, TruthOwner } from "./decisionBrief";

export const BRIEF_RECIPE_VERSION = "brief-recipe.v1" as const;
export const BRIEF_PRESENTATION_VERSION = "brief-presentation.v1" as const;
export const INTERACTIVE_BRIEF_BUNDLE_VERSION = "interactive-brief-bundle.v1" as const;

export type AudienceLens =
  | "operator"
  | "delivery-leadership"
  | "executive"
  | "stakeholder-partner"
  | "portfolio-staffing"
  | "decision-scenario";

export type BriefPurpose =
  | "weekly-update"
  | "delivery-review"
  | "steering-committee"
  | "launch-readiness"
  | "decision-meeting"
  | "scenario-review"
  | "handoff"
  | "executive-update";

export type ModuleDensity = "headline" | "compact" | "expanded";

export type BriefModuleId =
  | "delivery-outlook"
  | "signal-read"
  | "why-this-date"
  | "commitment"
  | "movement"
  | "what-changed"
  | "acceleration-levers"
  | "leadership-asks"
  | "next"
  | "decisions"
  | "dependencies"
  | "scope"
  | "capacity"
  | "timeline"
  | "audit-delta"
  | "evidence"
  | "source-health"
  | "caveats"
  | "operator-note";

export interface BriefModuleConfig {
  id: BriefModuleId;
  density: ModuleDensity;
}

export interface BriefRecipeV1 {
  version: typeof BRIEF_RECIPE_VERSION;
  type: "audience-brief";
  audience: AudienceLens;
  purpose: BriefPurpose;
  mode: BriefMode;
  compareTo: string | null;
  modules: BriefModuleConfig[];
  density: ModuleDensity;
  operatorNote: string | null;
  promotedAskIds: string[];
}

export interface ModuleDefinition {
  id: BriefModuleId;
  label: string;
  shortLabel: string;
  owner: TruthOwner | "Presentation";
  bindings: string[];
  description: string;
  facts: string[];
  suitableFor: AudienceLens[];
  densities: ModuleDensity[];
  tone: "reality" | "choice" | "capacity" | "outcome" | "time" | "attention";
}

const allAudiences: AudienceLens[] = ["operator", "delivery-leadership", "executive", "stakeholder-partner", "portfolio-staffing", "decision-scenario"];
const allDensities: ModuleDensity[] = ["headline", "compact", "expanded"];

export const MODULE_CATALOG: readonly ModuleDefinition[] = [
  { id: "delivery-outlook", label: "Delivery Outlook", shortLabel: "Outlook", owner: "Forecast", bindings: ["headline.likelyWindow", "headline.confidenceAtTarget", "headline.targetDate"], description: "The live outcome, target and confidence—without turning likely into committed.", facts: ["likely window", "target", "confidence", "Reality/Scenario"], suitableFor: allAudiences, densities: allDensities, tone: "outcome" },
  { id: "signal-read", label: "Signal's Read", shortLabel: "Signal's Read", owner: "Presentation", bindings: ["headline", "calls", "changes", "caveats"], description: "Deterministic narrative composed only from frozen facts.", facts: ["outcome", "movement", "primary supported driver", "caveat count"], suitableFor: ["operator", "delivery-leadership", "executive", "decision-scenario"], densities: ["compact", "expanded"], tone: "reality" },
  { id: "why-this-date", label: "Why This Date", shortLabel: "Drivers", owner: "Forecast", bindings: ["calls.decisions", "calls.dependencies", "movable.scope", "movable.capacity"], description: "Two to four supported schedule drivers; never a prose-invented cause.", facts: ["serial gates", "dependencies", "executable Scope", "effective Capacity"], suitableFor: ["operator", "delivery-leadership", "executive", "decision-scenario"], densities: allDensities, tone: "attention" },
  { id: "commitment", label: "Commitment", shortLabel: "Commit", owner: "Timeline", bindings: ["headline.targetDate", "timeline.nextMilestone"], description: "Keeps likely, target and canonical commitment semantically separate.", facts: ["likely", "target", "canonical commitment or explicit absence"], suitableFor: allAudiences, densities: allDensities, tone: "choice" },
  { id: "movement", label: "Movement", shortLabel: "Movement", owner: "ReportHistory", bindings: ["headline.movement"], description: "Comparison with an explicitly historical saved brief.", facts: ["date delta", "confidence delta", "comparison report id"], suitableFor: allAudiences, densities: allDensities, tone: "reality" },
  { id: "what-changed", label: "What Changed", shortLabel: "Changes", owner: "Scope", bindings: ["changes.audit", "changes.delivery", "changes.currentness"], description: "Compact delivery and Audit change summary with trust caveats attached.", facts: ["shipped work", "new Findings", "resolved Findings", "provider changes"], suitableFor: allAudiences, densities: allDensities, tone: "reality" },
  { id: "acceleration-levers", label: "Acceleration Levers", shortLabel: "Levers", owner: "Forecast", bindings: ["movable.scenarioOptions"], description: "Only existing Forecast-owned scenario consequences.", facts: ["scenario", "likely-date delta", "confidence"], suitableFor: ["operator", "delivery-leadership", "executive", "portfolio-staffing", "decision-scenario"], densities: allDensities, tone: "outcome" },
  { id: "leadership-asks", label: "Leadership Asks", shortLabel: "Asks", owner: "Decisions", bindings: ["calls.decisions", "calls.dependencies"], description: "Operator-promoted asks only; candidates never imply organizational authority.", facts: ["promoted asks", "candidate asks", "owner", "needed-by", "gate"], suitableFor: ["delivery-leadership", "executive", "stakeholder-partner", "decision-scenario"], densities: allDensities, tone: "attention" },
  { id: "next", label: "What's Next", shortLabel: "Next", owner: "Timeline", bindings: ["timeline.nextMilestone", "calls.decisions", "calls.dependencies"], description: "The next milestone and nearest material call/dependency.", facts: ["milestone", "needed-by decision", "dependency"], suitableFor: allAudiences, densities: allDensities, tone: "time" },
  { id: "decisions", label: "Decisions", shortLabel: "Decisions", owner: "Decisions", bindings: ["calls.decisions"], description: "All first-class open Decisions, preserving gated versus ungated semantics.", facts: ["status", "owner", "needed-by", "modeled delay", "gate target"], suitableFor: ["operator", "delivery-leadership", "decision-scenario"], densities: allDensities, tone: "choice" },
  { id: "dependencies", label: "Dependencies", shortLabel: "Dependencies", owner: "Dependencies", bindings: ["calls.dependencies"], description: "Only declared Scope dependency edges.", facts: ["target Scope", "forecast availability"], suitableFor: ["operator", "delivery-leadership", "stakeholder-partner", "portfolio-staffing", "decision-scenario"], densities: allDensities, tone: "attention" },
  { id: "scope", label: "Executable Scope", shortLabel: "Scope", owner: "Forecast", bindings: ["movable.scope"], description: "Canonical executable work after parent-container de-duplication.", facts: ["item count", "effort range"], suitableFor: ["operator", "delivery-leadership", "portfolio-staffing", "decision-scenario"], densities: allDensities, tone: "reality" },
  { id: "capacity", label: "Capacity", shortLabel: "Capacity", owner: "Capacity", bindings: ["movable.capacity"], description: "Named staffing only when the upstream reconciliation contract passes.", facts: ["raw FTE", "effective FTE", "Forecast FTE", "context-switch loss", "contributors"], suitableFor: ["operator", "delivery-leadership", "portfolio-staffing", "decision-scenario"], densities: allDensities, tone: "capacity" },
  { id: "timeline", label: "Timeline", shortLabel: "Timeline", owner: "Timeline", bindings: ["timeline"], description: "Live Forecast context, next milestone and current conflicts.", facts: ["Current Forecast", "milestone", "conflicts"], suitableFor: ["operator", "delivery-leadership", "stakeholder-partner", "portfolio-staffing", "decision-scenario"], densities: allDensities, tone: "time" },
  { id: "audit-delta", label: "Audit Delta", shortLabel: "Audit", owner: "Audit", bindings: ["changes.audit"], description: "New and resolved Findings with comparison trust attached.", facts: ["run ids", "new Findings", "resolved Findings", "grounding"], suitableFor: ["operator", "delivery-leadership", "decision-scenario"], densities: allDensities, tone: "reality" },
  { id: "evidence", label: "Evidence & Grounding", shortLabel: "Evidence", owner: "Audit", bindings: ["evidence.references", "evidence.warnings"], description: "Passage/source grounding and currentness for material claims.", facts: ["Finding", "grounding", "currentness", "evidence refs"], suitableFor: ["operator", "decision-scenario"], densities: ["compact", "expanded"], tone: "reality" },
  { id: "source-health", label: "Source Health", shortLabel: "Sources", owner: "ContextSnapshot", bindings: ["identity.sourceSnapshots", "changes.currentness"], description: "Owner, as-of, temporal role and provider health.", facts: ["owner", "as-of", "live/historical", "currentness"], suitableFor: ["operator", "delivery-leadership", "portfolio-staffing", "decision-scenario"], densities: ["compact", "expanded"], tone: "reality" },
  { id: "caveats", label: "Missing Inputs", shortLabel: "Caveats", owner: "ContextSnapshot", bindings: ["caveats"], description: "Missing, stale, unreconciled and weak-grounding limits remain visible.", facts: ["code", "message"], suitableFor: ["operator", "delivery-leadership", "executive", "portfolio-staffing", "decision-scenario"], densities: allDensities, tone: "attention" },
  { id: "operator-note", label: "Operator Note", shortLabel: "Note", owner: "Presentation", bindings: ["recipe.operatorNote"], description: "Optional authored context. Clearly labeled and never merged with owner facts.", facts: ["operator-authored note"], suitableFor: allAudiences, densities: ["compact", "expanded"], tone: "choice" },
] as const;

export const AUDIENCE_LABELS: Record<AudienceLens, string> = {
  operator: "Operator / PO",
  "delivery-leadership": "Delivery Leadership",
  executive: "Executive",
  "stakeholder-partner": "Stakeholder / Partner",
  "portfolio-staffing": "Portfolio / Staffing",
  "decision-scenario": "Decision / Scenario",
};

export const PURPOSE_LABELS: Record<BriefPurpose, string> = {
  "weekly-update": "Weekly Update",
  "delivery-review": "Delivery Review",
  "steering-committee": "Steering Committee",
  "launch-readiness": "Launch Readiness",
  "decision-meeting": "Decision Meeting",
  "scenario-review": "Scenario Review",
  handoff: "Handoff",
  "executive-update": "Executive Update",
};

type PresetModule = readonly [BriefModuleId, ModuleDensity];

const AUDIENCE_PRESETS: Record<AudienceLens, readonly PresetModule[]> = {
  operator: [["delivery-outlook", "headline"], ["signal-read", "compact"], ["what-changed", "expanded"], ["why-this-date", "expanded"], ["decisions", "expanded"], ["dependencies", "compact"], ["scope", "compact"], ["capacity", "expanded"], ["timeline", "compact"], ["acceleration-levers", "expanded"], ["audit-delta", "expanded"], ["evidence", "expanded"], ["source-health", "expanded"], ["caveats", "expanded"]],
  "delivery-leadership": [["delivery-outlook", "headline"], ["commitment", "compact"], ["movement", "compact"], ["why-this-date", "expanded"], ["acceleration-levers", "expanded"], ["leadership-asks", "compact"], ["what-changed", "compact"], ["next", "compact"], ["dependencies", "compact"], ["source-health", "compact"], ["caveats", "compact"]],
  executive: [["delivery-outlook", "headline"], ["commitment", "compact"], ["movement", "compact"], ["signal-read", "compact"], ["why-this-date", "compact"], ["leadership-asks", "compact"], ["acceleration-levers", "headline"], ["caveats", "compact"]],
  "stakeholder-partner": [["delivery-outlook", "headline"], ["movement", "compact"], ["what-changed", "compact"], ["next", "compact"], ["dependencies", "compact"], ["operator-note", "compact"]],
  "portfolio-staffing": [["capacity", "headline"], ["scope", "expanded"], ["delivery-outlook", "compact"], ["acceleration-levers", "expanded"], ["dependencies", "compact"], ["timeline", "compact"], ["source-health", "compact"], ["caveats", "expanded"]],
  "decision-scenario": [["delivery-outlook", "compact"], ["commitment", "compact"], ["why-this-date", "expanded"], ["acceleration-levers", "headline"], ["leadership-asks", "expanded"], ["decisions", "expanded"], ["dependencies", "expanded"], ["scope", "compact"], ["capacity", "compact"], ["evidence", "expanded"], ["caveats", "expanded"]],
};

const PURPOSE_PROMOTIONS: Record<BriefPurpose, BriefModuleId[]> = {
  "weekly-update": ["delivery-outlook", "movement", "what-changed", "next"],
  "delivery-review": ["delivery-outlook", "why-this-date", "scope", "capacity", "dependencies"],
  "steering-committee": ["delivery-outlook", "commitment", "leadership-asks", "why-this-date"],
  "launch-readiness": ["commitment", "timeline", "dependencies", "caveats", "source-health"],
  "decision-meeting": ["leadership-asks", "decisions", "why-this-date", "evidence"],
  "scenario-review": ["acceleration-levers", "capacity", "scope", "why-this-date"],
  handoff: ["next", "scope", "decisions", "dependencies", "source-health"],
  "executive-update": ["delivery-outlook", "commitment", "signal-read", "leadership-asks"],
};

export function moduleDefinition(id: BriefModuleId): ModuleDefinition {
  return MODULE_CATALOG.find((item) => item.id === id)!;
}

export function buildBriefRecipe(
  audience: AudienceLens,
  purpose: BriefPurpose,
  brief?: Pick<DecisionBriefV1, "identity" | "headline">
): BriefRecipeV1 {
  const preset = AUDIENCE_PRESETS[audience].map(([id, density]) => ({ id, density }));
  const promotions = PURPOSE_PROMOTIONS[purpose];
  const promoted = promotions
    .map((id) => preset.find((item) => item.id === id))
    .filter((item): item is BriefModuleConfig => !!item);
  const promotedIds = new Set(promoted.map((item) => item.id));
  return {
    version: BRIEF_RECIPE_VERSION,
    type: "audience-brief",
    audience,
    purpose,
    mode: brief?.identity.mode ?? "reality",
    compareTo: brief?.headline.movement.value?.comparedToReportId ?? null,
    modules: [...promoted, ...preset.filter((item) => !promotedIds.has(item.id))],
    density: audience === "executive" || audience === "stakeholder-partner" ? "compact" : "expanded",
    operatorNote: null,
    promotedAskIds: [],
  };
}

const audiences = new Set<AudienceLens>(Object.keys(AUDIENCE_LABELS) as AudienceLens[]);
const purposes = new Set<BriefPurpose>(Object.keys(PURPOSE_LABELS) as BriefPurpose[]);
const modules = new Set<BriefModuleId>(MODULE_CATALOG.map((item) => item.id));
const densities = new Set<ModuleDensity>(["headline", "compact", "expanded"]);

export function isBriefRecipeV1(value: unknown): value is BriefRecipeV1 {
  if (!value || typeof value !== "object") return false;
  const recipe = value as Partial<BriefRecipeV1>;
  return recipe.version === BRIEF_RECIPE_VERSION
    && recipe.type === "audience-brief"
    && audiences.has(recipe.audience as AudienceLens)
    && purposes.has(recipe.purpose as BriefPurpose)
    && (recipe.mode === "reality" || recipe.mode === "scenario")
    && Array.isArray(recipe.modules)
    && recipe.modules.every((item) => !!item && modules.has(item.id) && densities.has(item.density))
    && Array.isArray(recipe.promotedAskIds);
}

export function normalizeBriefRecipe(value: unknown, brief: DecisionBriefV1): BriefRecipeV1 {
  if (!isBriefRecipeV1(value)) return buildBriefRecipe("delivery-leadership", "weekly-update", brief);
  const seen = new Set<BriefModuleId>();
  const normalizedModules = value.modules.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return moduleDefinition(item.id).densities.includes(item.density);
  });
  return {
    ...value,
    mode: brief.identity.mode,
    compareTo: brief.headline.movement.value?.comparedToReportId ?? null,
    modules: normalizedModules.length ? normalizedModules : buildBriefRecipe(value.audience, value.purpose, brief).modules,
    operatorNote: typeof value.operatorNote === "string" && value.operatorNote.trim() ? value.operatorNote.trim().slice(0, 2_000) : null,
    promotedAskIds: [...new Set(value.promotedAskIds.filter((id) => brief.calls.decisions.value.some((decision) => decision.id === id)))],
  };
}

export function moveRecipeModule(recipe: BriefRecipeV1, activeId: BriefModuleId, overId: BriefModuleId): BriefRecipeV1 {
  const from = recipe.modules.findIndex((item) => item.id === activeId);
  const to = recipe.modules.findIndex((item) => item.id === overId);
  if (from < 0 || to < 0 || from === to) return recipe;
  const next = [...recipe.modules];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { ...recipe, modules: next };
}

export function toggleRecipeModule(recipe: BriefRecipeV1, id: BriefModuleId): BriefRecipeV1 {
  const exists = recipe.modules.some((item) => item.id === id);
  return exists
    ? { ...recipe, modules: recipe.modules.filter((item) => item.id !== id) }
    : { ...recipe, modules: [...recipe.modules, { id, density: moduleDefinition(id).densities[0] }] };
}

export function setRecipeModuleDensity(recipe: BriefRecipeV1, id: BriefModuleId, density: ModuleDensity): BriefRecipeV1 {
  if (!moduleDefinition(id).densities.includes(density)) return recipe;
  return { ...recipe, modules: recipe.modules.map((item) => item.id === id ? { ...item, density } : item) };
}
