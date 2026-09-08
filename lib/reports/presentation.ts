import type { DecisionBriefV1, SourceStamp } from "./decisionBrief";
import { formatDateOnly } from "@/lib/time/dateContract";
import { briefPayloadFingerprint } from "./decisionBriefRender";
import {
  AUDIENCE_LABELS,
  BRIEF_PRESENTATION_VERSION,
  MODULE_CATALOG,
  PURPOSE_LABELS,
  normalizeBriefRecipe,
  type AudienceLens,
  type BriefModuleConfig,
  type BriefModuleId,
  type BriefPurpose,
  type BriefRecipeV1,
} from "./composer";

export interface DeliveryDriver {
  id: string;
  family: "decision-gate" | "dependency" | "scope" | "capacity";
  label: string;
  detail: string;
  owner: SourceStamp["owner"];
  href: string;
}

export interface LeadershipAsk {
  id: string;
  label: string;
  owner: string | null;
  neededBy: string | null;
  gated: boolean;
  confirmed: boolean;
  href: string;
}

export interface BriefPresentationV1 {
  version: typeof BRIEF_PRESENTATION_VERSION;
  snapshotFingerprint: string;
  projectId: string;
  projectName: string;
  generatedAt: string;
  audience: AudienceLens;
  audienceLabel: string;
  purpose: BriefPurpose;
  purposeLabel: string;
  recipe: BriefRecipeV1;
  modules: BriefModuleConfig[];
  commitment: {
    status: "recorded" | "missing";
    date: string | null;
    label: string;
    source: SourceStamp;
  };
  drivers: DeliveryDriver[];
  leadershipAsks: LeadershipAsk[];
  leadershipAskCandidates: LeadershipAsk[];
  signalRead: string;
}

function isoDate(iso: string | null): string {
  return iso ? formatDateOnly(iso, { month: "short", day: "numeric", year: "numeric" }) : "MISSING";
}

export function sourceForModule(brief: DecisionBriefV1, id: BriefModuleId): SourceStamp {
  switch (id) {
    case "delivery-outlook":
    case "why-this-date":
    case "acceleration-levers":
    case "scope": return brief.headline.likelyWindow.source;
    case "commitment":
    case "next":
    case "timeline": return brief.timeline.nextMilestone.source;
    case "movement": return brief.headline.movement.source;
    case "what-changed":
    case "audit-delta": return brief.changes.audit.source;
    case "leadership-asks":
    case "decisions": return brief.calls.decisions.source;
    case "dependencies": return brief.calls.dependencies.source;
    case "capacity": return brief.movable.capacity.source;
    case "evidence": return brief.evidence.references.source;
    case "source-health":
    case "caveats": return brief.caveats.source;
    case "signal-read":
    case "operator-note": return {
      owner: "ReportHistory",
      asOf: brief.identity.generatedAt,
      temporalRole: "historical",
      currentness: "current",
      sourceId: briefPayloadFingerprint(brief),
      note: "Presentation-only wording over the frozen snapshot.",
    };
  }
}

export function deliveryDrivers(brief: DecisionBriefV1): DeliveryDriver[] {
  const drivers: DeliveryDriver[] = [];
  for (const decision of brief.calls.decisions.value.filter((item) => item.gated).slice(0, 2)) {
    drivers.push({
      id: `gate:${decision.id}`,
      family: "decision-gate",
      label: decision.title,
      detail: `${decision.modeledDelay.low}/${decision.modeledDelay.likely}/${decision.modeledDelay.high} serial days · target ${decision.gate?.targetScopeName ?? "MISSING"}`,
      owner: "Decisions",
      href: decision.href,
    });
  }
  for (const dependency of brief.calls.dependencies.value.slice(0, Math.max(0, 3 - drivers.length))) {
    drivers.push({
      id: `dependency:${dependency.scopeId}`,
      family: "dependency",
      label: dependency.name,
      detail: dependency.likelyDate ? `Declared dependency · likely ${isoDate(dependency.likelyDate)}` : "Declared dependency · current consequence UNAVAILABLE",
      owner: "Dependencies",
      href: dependency.href,
    });
  }
  if (drivers.length < 4) {
    const scope = brief.movable.scope.value;
    drivers.push({
      id: "scope:executable",
      family: "scope",
      label: `${scope.executableItemCount} executable work item${scope.executableItemCount === 1 ? "" : "s"}`,
      detail: `${scope.remainingEffortDays.low}/${scope.remainingEffortDays.likely}/${scope.remainingEffortDays.high} effort days low/likely/high`,
      owner: "Forecast",
      href: scope.href,
    });
  }
  if (drivers.length < 4) {
    const capacity = brief.movable.capacity.value;
    drivers.push({
      id: "capacity:effective",
      family: "capacity",
      label: capacity.availability === "available" ? `${capacity.forecastEffectiveFte} effective Forecast FTE` : "Named Capacity unavailable",
      detail: capacity.availability === "available" ? `${capacity.namedRawFte} raw → ${capacity.namedEffectiveFte} effective FTE` : `Forecast uses ${capacity.forecastEffectiveFte} FTE; no named-staffing claim`,
      owner: "Capacity",
      href: capacity.href,
    });
  }
  return drivers.slice(0, 4);
}

function leadershipAskCandidates(brief: DecisionBriefV1, recipe: BriefRecipeV1): { promoted: LeadershipAsk[]; candidates: LeadershipAsk[] } {
  const cutoff = new Date(brief.identity.generatedAt).getTime() + 14 * 86_400_000;
  const candidates = brief.calls.decisions.value
    .filter((decision) => decision.gated || (!!decision.neededBy && new Date(decision.neededBy).getTime() <= cutoff))
    .map((decision) => ({
      id: decision.id,
      label: decision.title,
      owner: decision.owner,
      neededBy: decision.neededBy,
      gated: decision.gated,
      confirmed: recipe.promotedAskIds.includes(decision.id),
      href: decision.href,
    }));
  return { promoted: candidates.filter((item) => item.confirmed), candidates: candidates.filter((item) => !item.confirmed) };
}

function deterministicSignalRead(brief: DecisionBriefV1, drivers: DeliveryDriver[]): string {
  const likely = isoDate(brief.headline.likelyWindow.value.likely);
  const movement = brief.headline.movement.value;
  const movementText = movement
    ? `${Math.abs(movement.days)} day${Math.abs(movement.days) === 1 ? "" : "s"} ${movement.days < 0 ? "earlier" : movement.days > 0 ? "later" : "unchanged"} than the previous saved brief`
    : "with no prior saved brief for a trend claim";
  const driver = drivers[0]?.detail ?? "no ranked schedule driver available";
  const caveat = brief.caveats.value.length ? ` ${brief.caveats.value.length} explicit decision-input caveat${brief.caveats.value.length === 1 ? " remains" : "s remain"}.` : "";
  return `${brief.identity.project.value.name} remains likely around ${likely}, ${movementText}. The leading supported schedule sensitivity is ${driver}.${caveat}`;
}

export function buildBriefPresentation(brief: DecisionBriefV1, inputRecipe: unknown): BriefPresentationV1 {
  const recipe = normalizeBriefRecipe(inputRecipe, brief);
  const drivers = deliveryDrivers(brief);
  const asks = leadershipAskCandidates(brief, recipe);
  // DecisionBriefV1 currently contains a target and milestone, but no
  // canonical project-level delivery commitment. Presentation must not
  // promote either into one.
  const commitmentSource = brief.timeline.nextMilestone.source;
  return {
    version: BRIEF_PRESENTATION_VERSION,
    snapshotFingerprint: briefPayloadFingerprint(brief),
    projectId: brief.identity.project.value.id,
    projectName: brief.identity.project.value.name,
    generatedAt: brief.identity.generatedAt,
    audience: recipe.audience,
    audienceLabel: AUDIENCE_LABELS[recipe.audience],
    purpose: recipe.purpose,
    purposeLabel: PURPOSE_LABELS[recipe.purpose],
    recipe,
    modules: recipe.modules,
    commitment: { status: "missing", date: null, label: "NO CANONICAL DELIVERY COMMITMENT", source: commitmentSource },
    drivers,
    leadershipAsks: asks.promoted,
    leadershipAskCandidates: asks.candidates,
    signalRead: deterministicSignalRead(brief, drivers),
  };
}

export const MODULE_IDS = MODULE_CATALOG.map((item) => item.id);
