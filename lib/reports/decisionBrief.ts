/**
 * DecisionBriefV1 is Reports' complete, serializable read contract.
 *
 * Reports owns the arrangement and wording. Every fact remains wrapped in
 * the identity, timestamp, currentness and temporal role of its canonical
 * owner. The assembler is pure: database/Linear reads happen elsewhere and
 * persistence happens only after this value is complete.
 */

export const DECISION_BRIEF_VERSION = "decision-brief.v1" as const;

export type BriefMode = "reality" | "scenario";
export type TemporalRole = "live" | "historical";
export type Currentness = "current" | "stale" | "missing" | "unavailable" | "unreconciled";
export type TruthOwner =
  | "Scope"
  | "Forecast"
  | "Audit"
  | "Decisions"
  | "Dependencies"
  | "Capacity"
  | "Timeline"
  | "ContextSnapshot"
  | "ReportHistory";

export interface SourceStamp {
  owner: TruthOwner;
  asOf: string;
  temporalRole: TemporalRole;
  currentness: Currentness;
  sourceId: string | null;
  note?: string;
}

export interface Sourced<T> {
  value: T;
  source: SourceStamp;
}

export interface BriefFindingInput {
  id: string;
  type: string;
  title: string;
  status: string;
  severity: string;
  createdAt: string;
  sourceId: string | null;
  contextSnapshotId: string | null;
  evidenceRefs: string[];
  matchedIssues: string[];
}

export interface AuditObservationInput {
  runId: string;
  asOf: string;
  sourceId: string | null;
  contextSnapshotId: string | null;
  findings: BriefFindingInput[];
}

export interface BriefDecisionInput {
  id: string;
  scopeId: string;
  title: string;
  status: string;
  owner: string | null;
  neededBy: string | null;
  createdAt: string;
  evidenceCount: number;
  gate: null | {
    id: string;
    targetScopeId: string;
    targetScopeName: string;
    dependency: string;
    evidenceForGate: string;
    low: number;
    likely: number;
    high: number;
    serial: boolean;
    provenance: string;
  };
}

export interface CapacityContributorInput {
  personId: string;
  name: string;
  rawFte: number;
  effectiveFte: number;
  scopeCount: number;
}

export interface DecisionBriefOwnerInputs {
  generatedAt: string;
  mode: BriefMode;
  scenarioId: string | null;
  project: {
    id: string;
    name: string;
    targetDate: string | null;
    asOf: string;
  };
  context: {
    snapshotId: string | null;
    packageId: string | null;
    asOf: string | null;
    currentness: Currentness;
    missingSources: string[];
    warnings: string[];
  };
  forecast: {
    sourceId: string;
    asOf: string;
    earliestDate: string;
    likelyDate: string;
    latestDate: string;
    confidenceAtTarget: number | null;
    remainingIssueCount: number;
    unticketedFindingCount: number;
    remainingEffortDays: { low: number; likely: number; high: number };
    decisionDelayDays: { low: number; likely: number; high: number };
    scenarios: { id: string; label: string; likelyDate: string; deltaDays: number; confidenceAtTarget: number | null }[];
  };
  previousReport: null | {
    id: string;
    generatedAt: string;
    likelyDate: string;
    confidenceAtTarget: number | null;
  };
  audit: {
    current: AuditObservationInput | null;
    prior: AuditObservationInput | null;
  };
  delivery: {
    shipped: { identifier: string; title: string }[];
  };
  decisions: BriefDecisionInput[];
  dependencies: { scopeId: string; name: string; likelyDate: string | null; currentness: Currentness }[];
  capacity: {
    source: "allocations" | "explicit" | "inferred";
    status: "named_exact" | "legacy_inferred_unstaffed" | "legacy_explicit_unstaffed";
    reconciles: boolean;
    workforceFte: number;
    namedRawFte: number;
    namedEffectiveFte: number;
    forecastEffectiveFte: number;
    contextSwitchCostPct: number;
    contributors: CapacityContributorInput[];
    asOf: string;
  };
  timeline: {
    asOf: string;
    events: {
      id: string;
      title: string;
      date: string;
      endDate: string | null;
      temporalState: "occurred" | "planned";
      sourceLabel: string | null;
    }[];
  };
  kitConstructAvailable: boolean;
}

export interface DecisionBriefV1 {
  version: typeof DECISION_BRIEF_VERSION;
  identity: {
    project: Sourced<{ id: string; name: string }>;
    generatedAt: string;
    mode: BriefMode;
    scenarioId: string | null;
    sourceSnapshots: SourceStamp[];
  };
  headline: {
    targetDate: Sourced<string | null>;
    likelyWindow: Sourced<{ earliest: string; likely: string; latest: string }>;
    confidenceAtTarget: Sourced<number | null>;
    movement: Sourced<{ days: number; confidencePoints: number | null; comparedToReportId: string } | null>;
    keyReason: Sourced<string>;
  };
  changes: {
    audit: Sourced<{
      currentRunId: string | null;
      priorRunId: string | null;
      newFindings: BriefFindingInput[];
      resolvedFindings: BriefFindingInput[];
    }>;
    delivery: Sourced<{ shipped: { identifier: string; title: string; href: string }[] }>;
    currentness: Sourced<{ missingSources: string[]; warnings: string[] }>;
  };
  calls: {
    decisions: Sourced<{
      id: string;
      title: string;
      owner: string | null;
      neededBy: string | null;
      status: string;
      gated: boolean;
      modeledDelay: { low: number; likely: number; high: number };
      gate: BriefDecisionInput["gate"];
      href: string;
      targetScopeHref: string | null;
      evidenceCount: number;
    }[]>;
    dependencies: Sourced<{ scopeId: string; name: string; likelyDate: string | null; currentness: Currentness; href: string }[]>;
  };
  movable: {
    capacity: Sourced<{
      availability: "available" | "missing" | "unavailable";
      source: DecisionBriefOwnerInputs["capacity"]["source"];
      status: DecisionBriefOwnerInputs["capacity"]["status"];
      reconciles: boolean;
      workforceFte: number;
      namedRawFte: number | null;
      namedEffectiveFte: number | null;
      forecastEffectiveFte: number;
      contextSwitchCostPct: number;
      contributors: CapacityContributorInput[];
      href: string;
    }>;
    scenarioOptions: Sourced<DecisionBriefOwnerInputs["forecast"]["scenarios"]>;
  };
  timeline: {
    nextMilestone: Sourced<DecisionBriefOwnerInputs["timeline"]["events"][number] | null>;
    conflicts: Sourced<DecisionBriefOwnerInputs["timeline"]["events"]>;
    currentForecast: Sourced<{ earliestDate: string; likelyDate: string; latestDate: string; href: string }>;
  };
  evidence: {
    references: Sourced<{
      findingId: string;
      title: string;
      grounding: "passage" | "source_only" | "none";
      currentness: Currentness;
      evidenceRefs: string[];
      sourceId: string | null;
      contextSnapshotId: string | null;
      href: string;
    }[]>;
    warnings: Sourced<string[]>;
  };
  boundaries: {
    findingsForecastEffect: Sourced<{ unacceptedFindingCount: number; modeledBaselineWorkItems: 0 }>;
    timelineReading: Sourced<{ temporalRole: "live"; label: "Current Forecast" }>;
  };
  caveats: Sourced<{ code: string; message: string }[]>;
}

const day = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / day);
const keyFor = (f: BriefFindingInput) => `${f.type}:${f.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
const source = (
  owner: TruthOwner,
  asOf: string,
  sourceId: string | null,
  currentness: Currentness = "current",
  temporalRole: TemporalRole = "live",
  note?: string
): SourceStamp => ({ owner, asOf, sourceId, currentness, temporalRole, ...(note ? { note } : {}) });

export function decisionBriefHref(route: string, projectId: string, select?: string): string {
  const params = new URLSearchParams({ project: projectId });
  if (select) params.set("select", select);
  return `${route}?${params.toString()}`;
}

function auditDelta(current: AuditObservationInput | null, prior: AuditObservationInput | null) {
  if (!current) return { currentRunId: null, priorRunId: prior?.runId ?? null, newFindings: [], resolvedFindings: [] };
  const priorByKey = new Map((prior?.findings ?? []).map((f) => [keyFor(f), f]));
  const currentByKey = new Map(current.findings.map((f) => [keyFor(f), f]));
  const newFindings = current.findings.filter((f) => !priorByKey.has(keyFor(f)));
  const resolvedFindings = current.findings.filter((f) => {
    const before = priorByKey.get(keyFor(f));
    return !!before && before.status === "open" && f.status !== "open";
  });
  for (const before of prior?.findings ?? []) {
    if (before.status === "open" && !currentByKey.has(keyFor(before))) resolvedFindings.push(before);
  }
  return { currentRunId: current.runId, priorRunId: prior?.runId ?? null, newFindings, resolvedFindings };
}

function headlineReason(input: DecisionBriefOwnerInputs, delta: ReturnType<typeof auditDelta>): string {
  if (input.forecast.decisionDelayDays.likely > 0) {
    return `${input.forecast.decisionDelayDays.likely} likely serial day${input.forecast.decisionDelayDays.likely === 1 ? "" : "s"} come from open canonical Decision Gates.`;
  }
  if (input.previousReport) {
    const movement = daysBetween(input.previousReport.likelyDate, input.forecast.likelyDate);
    if (movement !== 0) return `The live Forecast likely date moved ${Math.abs(movement)} day${Math.abs(movement) === 1 ? "" : "s"} ${movement > 0 ? "later" : "earlier"} than the prior saved brief.`;
  }
  if (delta.newFindings.length > 0) return `${delta.newFindings.length} new Audit Finding${delta.newFindings.length === 1 ? "" : "s"} appeared since the prior Audit.`;
  return `${input.forecast.remainingIssueCount} canonical executable work item${input.forecast.remainingIssueCount === 1 ? " remains" : "s remain"} in the live Forecast.`;
}

export function assembleDecisionBrief(input: DecisionBriefOwnerInputs): DecisionBriefV1 {
  const forecastSource = source("Forecast", input.forecast.asOf, input.forecast.sourceId);
  const auditCurrentness: Currentness = input.audit.current ? "current" : "missing";
  const auditSource = source("Audit", input.audit.current?.asOf ?? input.generatedAt, input.audit.current?.runId ?? null, auditCurrentness);
  const delta = auditDelta(input.audit.current, input.audit.prior);
  const openDecisions = input.decisions.filter((decision) => decision.status === "open").map((decision) => {
    const gated = !!decision.gate?.serial;
    return {
      id: decision.id,
      title: decision.title,
      owner: decision.owner,
      neededBy: decision.neededBy,
      status: decision.status,
      gated,
      // This explicit zero is the Reports-side assertion of the Decision law.
      modeledDelay: gated
        ? { low: decision.gate!.low, likely: decision.gate!.likely, high: decision.gate!.high }
        : { low: 0, likely: 0, high: 0 },
      gate: decision.gate,
      href: decisionBriefHref("/decisions", decision.scopeId, `decision:${decision.id}`),
      targetScopeHref: decision.gate
        ? decisionBriefHref("/scope", decision.gate.targetScopeId)
        : null,
      evidenceCount: decision.evidenceCount,
    };
  });
  const currentFindings = input.audit.current?.findings ?? [];
  const references = currentFindings.map((finding) => ({
    findingId: finding.id,
    title: finding.title,
    grounding: finding.evidenceRefs.length > 0 ? "passage" as const : finding.sourceId || finding.contextSnapshotId ? "source_only" as const : "none" as const,
    currentness: input.context.currentness,
    evidenceRefs: finding.evidenceRefs,
    sourceId: finding.sourceId,
    contextSnapshotId: finding.contextSnapshotId,
    href: decisionBriefHref("/audit", input.project.id, `finding:${finding.id}`),
  }));
  const weak = references.filter((reference) => reference.grounding !== "passage");
  const namedAvailable = input.capacity.status === "named_exact" && input.capacity.reconciles;
  const capacityCurrentness: Currentness = namedAvailable
    ? "current"
    : input.capacity.source === "allocations"
      ? "unreconciled"
      : "missing";
  const capacityAvailability = namedAvailable ? "available" : input.capacity.source === "allocations" ? "unavailable" : "missing";
  const planned = [...input.timeline.events]
    .filter((event) => event.temporalState === "planned")
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextMilestone = planned.find((event) => new Date(event.date).getTime() >= new Date(input.generatedAt).getTime()) ?? null;
  const conflicts = planned.filter((event) => new Date(event.date).getTime() < new Date(input.generatedAt).getTime());
  const suspicious = input.decisions.filter((decision) =>
    /(^|\s)test(\s|$)/i.test(`${decision.title} ${decision.gate?.dependency ?? ""} ${decision.gate?.evidenceForGate ?? ""}`)
  );
  const evidenceWarnings = [
    ...(weak.length ? [`${weak.length} of ${references.length} current Finding${references.length === 1 ? "" : "s"} lack passage-level grounding.`] : []),
    ...input.context.missingSources.map((name) => `Tracked provider/source not supplied: ${name}.`),
    ...input.context.warnings,
    ...suspicious.map((decision) => `Governed test residue requires disposition: Decision “${decision.title}”${decision.gate ? ` / Gate “${decision.gate.dependency}”` : ""}.`),
  ];
  const caveats: { code: string; message: string }[] = [];
  if (!namedAvailable) caveats.push({ code: "CAPACITY_MISSING", message: "Named, reconciled Capacity is MISSING/UNAVAILABLE; no person or staffing claim is made." });
  if (!input.kitConstructAvailable) caveats.push({ code: "KIT_CONSTRUCT_MISSING", message: "No canonical KIT Construct project world exists; pivot scope, staffing and option consequences remain MISSING." });
  if (!input.context.snapshotId) caveats.push({ code: "CONTEXT_SNAPSHOT_MISSING", message: "No immutable ContextSnapshot is available for this brief." });
  if (input.context.missingSources.length) caveats.push({ code: "PROVIDERS_UNSUPPLIED", message: `${input.context.missingSources.length} active provider/source lane${input.context.missingSources.length === 1 ? " is" : "s are"} unsupplied.` });
  if (weak.length) caveats.push({ code: "WEAK_GROUNDING", message: `${weak.length} current Finding${weak.length === 1 ? " is" : "s are"} not grounded to passage-level evidence.` });
  if (suspicious.length) caveats.push({ code: "TEST_RESIDUE", message: `${suspicious.length} suspicious test Decision/Gate record${suspicious.length === 1 ? "" : "s"} remain for governed disposition.` });

  const movement = input.previousReport
    ? {
        days: daysBetween(input.previousReport.likelyDate, input.forecast.likelyDate),
        confidencePoints:
          input.previousReport.confidenceAtTarget === null || input.forecast.confidenceAtTarget === null
            ? null
            : input.forecast.confidenceAtTarget - input.previousReport.confidenceAtTarget,
        comparedToReportId: input.previousReport.id,
      }
    : null;
  const contextSource = source("ContextSnapshot", input.context.asOf ?? input.generatedAt, input.context.snapshotId, input.context.currentness, input.context.snapshotId ? "historical" : "live");
  const reportHistorySource = source("ReportHistory", input.previousReport?.generatedAt ?? input.generatedAt, input.previousReport?.id ?? null, input.previousReport ? "current" : "missing", "historical");
  const capacitySource = source("Capacity", input.capacity.asOf, input.project.id, capacityCurrentness);
  const timelineSource = source("Timeline", input.timeline.asOf, input.project.id);
  const decisionsSource = source("Decisions", input.generatedAt, input.project.id);
  const dependencySource = source("Dependencies", input.generatedAt, input.project.id);
  const scopeSource = source("Scope", input.project.asOf, input.project.id);

  return {
    version: DECISION_BRIEF_VERSION,
    identity: {
      project: { value: { id: input.project.id, name: input.project.name }, source: scopeSource },
      generatedAt: input.generatedAt,
      mode: input.mode,
      scenarioId: input.scenarioId,
      sourceSnapshots: [scopeSource, forecastSource, auditSource, decisionsSource, dependencySource, capacitySource, timelineSource, contextSource, reportHistorySource],
    },
    headline: {
      targetDate: { value: input.project.targetDate, source: scopeSource },
      likelyWindow: { value: { earliest: input.forecast.earliestDate, likely: input.forecast.likelyDate, latest: input.forecast.latestDate }, source: forecastSource },
      confidenceAtTarget: { value: input.forecast.confidenceAtTarget, source: forecastSource },
      movement: { value: movement, source: reportHistorySource },
      keyReason: { value: headlineReason(input, delta), source: forecastSource },
    },
    changes: {
      audit: { value: delta, source: auditSource },
      delivery: {
        value: { shipped: input.delivery.shipped.map((item) => ({ ...item, href: decisionBriefHref("/scope", input.project.id, `work:${item.identifier}`) })) },
        source: scopeSource,
      },
      currentness: { value: { missingSources: input.context.missingSources, warnings: input.context.warnings }, source: contextSource },
    },
    calls: {
      decisions: { value: openDecisions, source: decisionsSource },
      dependencies: {
        value: input.dependencies.map((dependency) => ({ ...dependency, href: decisionBriefHref("/orbit", input.project.id, `dependency:${dependency.scopeId}`) })),
        source: dependencySource,
      },
    },
    movable: {
      capacity: {
        value: {
          availability: capacityAvailability,
          source: input.capacity.source,
          status: input.capacity.status,
          reconciles: input.capacity.reconciles,
          workforceFte: input.capacity.workforceFte,
          namedRawFte: namedAvailable ? input.capacity.namedRawFte : null,
          namedEffectiveFte: namedAvailable ? input.capacity.namedEffectiveFte : null,
          forecastEffectiveFte: input.capacity.forecastEffectiveFte,
          contextSwitchCostPct: input.capacity.contextSwitchCostPct,
          contributors: namedAvailable ? input.capacity.contributors : [],
          href: decisionBriefHref("/portfolio", input.project.id),
        },
        source: capacitySource,
      },
      scenarioOptions: {
        value: input.forecast.scenarios,
        source: source("Forecast", input.forecast.asOf, input.forecast.sourceId, "current", "live", "Existing canonical Forecast scenarios; no new Reports simulation semantics."),
      },
    },
    timeline: {
      nextMilestone: { value: nextMilestone, source: timelineSource },
      conflicts: { value: conflicts, source: timelineSource },
      currentForecast: {
        value: { earliestDate: input.forecast.earliestDate, likelyDate: input.forecast.likelyDate, latestDate: input.forecast.latestDate, href: decisionBriefHref("/forecast", input.project.id) },
        source: forecastSource,
      },
    },
    evidence: {
      references: { value: references, source: auditSource },
      warnings: { value: evidenceWarnings, source: contextSource },
    },
    boundaries: {
      findingsForecastEffect: { value: { unacceptedFindingCount: input.forecast.unticketedFindingCount, modeledBaselineWorkItems: 0 }, source: forecastSource },
      timelineReading: { value: { temporalRole: "live", label: "Current Forecast" }, source: forecastSource },
    },
    caveats: { value: caveats, source: contextSource },
  };
}

export function isDecisionBriefV1(value: unknown): value is DecisionBriefV1 {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.version === DECISION_BRIEF_VERSION && !!record.identity && !!record.headline && !!record.calls;
}
