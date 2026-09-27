import type { DecisionBriefV1, SourceStamp } from "./decisionBrief";
import { formatDateOnly, formatInstant, toInstant } from "@/lib/time/dateContract";
import { FORECAST_PERCENTILE_COPY } from "@/lib/forecast/claims";
import { markdownBlockquoteLines, markdownInlineText } from "./markdown";
import { capabilityEstimatePresentation } from "./capabilityEstimatePresentation";

const date = (iso: string | null) =>
  iso ? formatDateOnly(iso, { month: "short", day: "numeric", year: "numeric" }) : "MISSING";
const instantDate = (iso: string) => formatInstant(toInstant(iso), {
  timeZone: "UTC", month: "short", day: "numeric", year: "numeric",
});
const n = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
const status = (source: SourceStamp) =>
  `${source.owner} · ${source.temporalRole === "historical" ? "HISTORICAL" : "FROZEN SNAPSHOT"} · source ${source.currentness.toUpperCase()} at generation · source as of ${instantDate(source.asOf)}${source.sourceId ? ` · ${source.sourceId}` : ""}${source.note ? ` · ${source.note}` : ""}`;

export function briefPayloadFingerprint(brief: DecisionBriefV1): string {
  // PostgreSQL JSONB does not preserve object-key insertion order. Sort keys
  // recursively so a payload fingerprints identically before and after its
  // immutable database round trip.
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stable(child)]));
  };
  const input = JSON.stringify(stable(brief));
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `dbv1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function renderDecisionBriefMarkdown(brief: DecisionBriefV1): string {
  const out: string[] = [];
  const pushSource = (stamp: SourceStamp) => out.push(`_${status(stamp)}_`, "");
  const project = brief.identity.project.value;
  const window = brief.headline.likelyWindow.value;

  out.push(`# ${project.name} — Decision Brief`);
  out.push(`**${brief.identity.mode === "reality" ? "REALITY" : "SCENARIO"} · generated ${instantDate(brief.identity.generatedAt)} · ${briefPayloadFingerprint(brief)}**`);
  if (brief.identity.mode === "scenario") out.push(`Scenario: ${brief.identity.scenarioId ?? "MISSING"}`);
  out.push("");

  out.push("## As-of / trust");
  for (const stamp of brief.identity.sourceSnapshots) out.push(`- ${status(stamp)}`);
  out.push("");

  out.push("## Headline");
  out.push(`**Snapshot P50 ${date(window.likely)} · P10–P90 interval ${date(window.earliest)}–${date(window.latest)} (middle 80% of simulated outcomes)**`);
  out.push(`${FORECAST_PERCENTILE_COPY.p10}. ${FORECAST_PERCENTILE_COPY.p50}. ${FORECAST_PERCENTILE_COPY.p90}.`);
  out.push(`Target: ${date(brief.headline.targetDate.value)} · Simulated frequency: ${brief.headline.confidenceAtTarget.value === null ? "UNAVAILABLE" : `${brief.headline.confidenceAtTarget.value}% of simulated runs under the frozen assumptions; not a measured real-world probability`}.`);
  const movement = brief.headline.movement.value;
  out.push(movement ? `Since saved brief ${movement.comparedToReportId}: ${movement.days === 0 ? "forecast unchanged" : `${Math.abs(movement.days)} day${Math.abs(movement.days) === 1 ? "" : "s"} ${movement.days > 0 ? "later" : "earlier"}`}${movement.confidencePoints === null ? "" : `; stored target-frequency change ${movement.confidencePoints >= 0 ? "+" : ""}${movement.confidencePoints} points`}.` : "No prior saved brief; no trend claim.");
  out.push(brief.headline.keyReason.value, "");
  if (brief.forecast?.assumptions) {
    out.push(`Forecast assumptions · ${brief.forecast.assumptions.version}`);
    for (const assumption of brief.forecast.assumptions.items) out.push(`- **${assumption.label}.** ${assumption.detail}`);
  } else {
    out.push("Forecast assumptions: **UNAVAILABLE IN LEGACY SNAPSHOT** — not backfilled from the current model.");
  }
  out.push("");
  pushSource(brief.headline.likelyWindow.source);

  out.push("## What changed");
  const audit = brief.changes.audit.value;
  out.push(`Audit comparison: ${audit.priorRunId ? `${audit.priorRunId} → ${audit.currentRunId ?? "MISSING"}` : audit.currentRunId ? `first comparable Audit ${audit.currentRunId}` : "MISSING"}.`);
  out.push(`New Findings (${audit.newFindings.length})`);
  if (!audit.newFindings.length) out.push("- None observed in the comparable Audit delta.");
  for (const finding of audit.newFindings) out.push(`- [${finding.title}](${brief.evidence.references.value.find((ref) => ref.findingId === finding.id)?.href ?? decisionFallback(brief, finding.id)}) · ${finding.severity} · ${finding.status}`);
  out.push(`Resolved/handled Findings (${audit.resolvedFindings.length})`);
  if (!audit.resolvedFindings.length) out.push("- None observed in the comparable Audit delta.");
  for (const finding of audit.resolvedFindings) out.push(`- ${finding.title} · ${finding.status}`);
  out.push(`Shipped/resolved work (${brief.changes.delivery.value.shipped.length})`);
  if (!brief.changes.delivery.value.shipped.length) out.push("- None supported by the canonical delivery delta.");
  for (const item of brief.changes.delivery.value.shipped) out.push(`- [${item.identifier} ${item.title}](${item.href})`);
  for (const missing of brief.changes.currentness.value.missingSources) out.push(`- MISSING provider/source: ${missing}`);
  for (const warning of brief.changes.currentness.value.warnings) out.push(`- WARNING: ${warning}`);
  out.push("");
  pushSource(brief.changes.audit.source);

  out.push("## What needs a call");
  if (!brief.calls.decisions.value.length) out.push("No first-class open Decisions.");
  for (const decision of brief.calls.decisions.value) {
    out.push(`- **[${decision.title}](${decision.href})** · owner ${decision.owner ?? "UNASSIGNED"} · needed by ${date(decision.neededBy)} · ${decision.gated ? "GATED" : "UNGATED"}`);
    if (decision.gate) {
      out.push(`  - Target: [${decision.gate.targetScopeName}](${decision.targetScopeHref!}) (\`${decision.gate.targetScopeId}\`)`);
      out.push(`  - Gate delay: ${n(decision.modeledDelay.low)} / ${n(decision.modeledDelay.likely)} / ${n(decision.modeledDelay.high)} days low / likely / high`);
      out.push(`  - Why serial: ${decision.gate.dependency}`);
    } else {
      out.push("  - Modeled delay: **0 days**. Open decisions do not affect Forecast without a canonical DecisionGate.");
    }
  }
  if (brief.calls.dependencies.value.length) {
    out.push("Declared dependency finish floors");
    for (const dependency of brief.calls.dependencies.value) out.push(`- [${dependency.name}](${dependency.href}) · completion floor · ${dependency.likelyDate ? `snapshot P50 ${date(dependency.likelyDate)}` : "snapshot consequence UNAVAILABLE"} · own work may proceed concurrently; each run uses the later completion.`);
  }
  out.push("");
  pushSource(brief.calls.decisions.source);

  out.push("## What can move");
  const scope = brief.movable.scope.value;
  out.push(`Forecast work basis: ${scope.executableItemCount} tracked source ticket${scope.executableItemCount === 1 ? "" : "s"}; ${scope.simulationItemCount ?? "LEGACY UNKNOWN"} simulated estimate-basis items; ${n(scope.remainingEffortDays.low)} / ${n(scope.remainingEffortDays.likely)} / ${n(scope.remainingEffortDays.high)} days low / likely / high. [Open Scope](${scope.href})`);
  if (scope.estimateQuality) out.push(`Estimate quality: ${scope.estimateQuality.pointsIssueCount} Linear-estimated · ${scope.estimateQuality.aiCount} AI-estimated · ${scope.estimateQuality.placeholderIssueCount + scope.estimateQuality.placeholderFindingCount} placeholders · ${scope.estimateQuality.placeholderEffortSharePct}% of likely effort rests on placeholders.`);
  if (scope.capabilityOutlooks?.length) {
    out.push("Isolated capability outlooks");
    for (const outlook of scope.capabilityOutlooks) {
      const people = outlook.contributors.map((person) => `${person.name} ${n(person.fte)} FTE`).join(" + ");
      const basis = outlook.estimateBasis === "knowledge_provisional"
        ? "provisional meeting estimate"
        : outlook.estimateBasis === "knowledge_accepted"
          ? "accepted meeting estimate"
          : "mapped-work rollup";
      out.push(`- **${outlook.name}** · P50 ${date(outlook.likelyDate)} (P10–P90 ${date(outlook.earliestDate)}–${date(outlook.latestDate)}) · ${people} · ${basis}`);
    }
    out.push("  - These are isolated card-level what-ifs, not a claim that the same people can execute several cards simultaneously.");
  }
  if (brief.forecast?.basis?.capabilityEstimates.length) {
    out.push("Frozen capability estimate basis");
    for (const record of brief.forecast.basis.capabilityEstimates) {
      const presentation = capabilityEstimatePresentation(record);
      const range = presentation.range ? `${n(presentation.range.low)} / ${n(presentation.range.likely)} / ${n(presentation.range.high)} developer-days` : "range unavailable";
      const capabilityName = markdownInlineText(record.capabilityName);
      const label = record.auditHref ? `[${capabilityName}](${record.auditHref})` : capabilityName;
      out.push(`- **${label}** · ${presentation.authorityLabel} ${presentation.basisLabel} · ${range} · source ${presentation.sourceDate ? date(presentation.sourceDate) : "date unavailable"}${record.review ? ` · ${presentation.usedInSimulation ? "used in this simulation" : "evidence only; ticket rollup used"}` : ` · replaces ${record.replacedItemIds.length} ticket ${record.replacedItemIds.length === 1 ? "estimate" : "estimates"}`}`);
      if (presentation.reviewSummary) out.push(`  - ${markdownInlineText(presentation.reviewSummary)}`);
      if (presentation.interpretation) out.push(`  - Reviewed interpretation: ${markdownInlineText(presentation.interpretation)}`);
      if (record.review) {
        out.push(`  - Reviewer ${markdownInlineText(presentation.reviewer ?? "unavailable")} · reviewed ${presentation.reviewedAt ? date(presentation.reviewedAt) : "date unavailable"}`);
        out.push(`  - Covered tickets: ${presentation.coveredItemIds.length ? presentation.coveredItemIds.map(markdownInlineText).join(", ") : "none"}`);
        out.push(`  - Additional tickets retained separately: ${presentation.additionalItemIds.length ? presentation.additionalItemIds.map(markdownInlineText).join(", ") : "none"}`);
      }
      out.push("  - Original statement (verbatim from frozen snapshot):");
      out.push(...markdownBlockquoteLines(presentation.originalQuote, "    "));
      out.push(`  - Raw assertion: ${markdownInlineText(presentation.rawAssertion)} · immutable snapshot ${markdownInlineText(presentation.contextSnapshotId)}`);
    }
  }
  const capacity = brief.movable.capacity.value;
  if (capacity.availability !== "available") {
    out.push(`**Named Capacity: ${capacity.availability.toUpperCase()}** · ${capacity.status}. Forecast currently uses ${n(capacity.forecastEffectiveFte)} FTE from ${capacity.source}; this is not a named-staffing claim.`);
  } else {
    out.push(`Named Capacity reconciles: ${n(capacity.namedRawFte!)} raw FTE → ${n(capacity.namedEffectiveFte!)} effective FTE → ${n(capacity.forecastEffectiveFte)} Forecast FTE.`);
    for (const contributor of capacity.contributors) out.push(`- ${contributor.name}: ${n(contributor.rawFte)} raw / ${n(contributor.effectiveFte)} effective FTE${contributor.scopeCount > 1 ? ` across ${contributor.scopeCount} projects` : ""}`);
  }
  out.push(`Context-switch setting: ${capacity.contextSwitchCostPct}% per additional project. [Open Capacity](${capacity.href})`);
  out.push("Existing canonical Forecast scenarios");
  if (!brief.movable.scenarioOptions.value.length) out.push("- UNAVAILABLE — no owner-provided scenario consequence exists.");
  for (const option of brief.movable.scenarioOptions.value) out.push(`- ${option.label}: P50 ${date(option.likelyDate)} (${Math.abs(option.deltaDays)} day${Math.abs(option.deltaDays) === 1 ? "" : "s"} ${option.deltaDays < 0 ? "sooner" : option.deltaDays > 0 ? "later" : "unchanged"}), target simulated frequency ${option.confidenceAtTarget === null ? "UNAVAILABLE" : `${option.confidenceAtTarget}% under frozen assumptions; not a measured probability`}`);
  out.push("");
  pushSource(brief.movable.capacity.source);

  out.push("## Timeline");
  out.push(`**Snapshot generated ${instantDate(brief.identity.generatedAt)} · source ${brief.timeline.currentForecast.source.currentness.toUpperCase()} at generation · source as of ${instantDate(brief.timeline.currentForecast.source.asOf)}**`);
  out.push(`[Snapshot P50 ${date(brief.timeline.currentForecast.value.likelyDate)} · P10–P90 ${date(brief.timeline.currentForecast.value.earliestDate)}–${date(brief.timeline.currentForecast.value.latestDate)}](${brief.timeline.currentForecast.value.href})`);
  const milestone = brief.timeline.nextMilestone.value;
  out.push(milestone ? `Next committed/current milestone: ${milestone.title} · ${date(milestone.date)}.` : "Next committed/current milestone: MISSING.");
  if (brief.timeline.conflicts.value.length) {
    out.push("Conflicts");
    for (const conflict of brief.timeline.conflicts.value) out.push(`- ${conflict.title} · planned ${date(conflict.date)} is overdue.`);
  } else out.push("Conflicts: none supported by current Timeline events.");
  out.push("");
  pushSource(brief.timeline.currentForecast.source);

  out.push("## Evidence / provenance / data quality");
  if (!brief.evidence.references.value.length) out.push("- Audit evidence references: MISSING.");
  for (const reference of brief.evidence.references.value) out.push(`- [${reference.title}](${reference.href}) · grounding ${reference.grounding.toUpperCase()} · currentness ${reference.currentness.toUpperCase()}${reference.evidenceRefs.length ? ` · ${reference.evidenceRefs.join(", ")}` : ""}`);
  for (const warning of brief.evidence.warnings.value) out.push(`- WARNING: ${warning}`);
  out.push(`- Forecast boundary: ${brief.boundaries.findingsForecastEffect.value.unacceptedFindingCount} unaccepted Finding${brief.boundaries.findingsForecastEffect.value.unacceptedFindingCount === 1 ? "" : "s"}; **${brief.boundaries.findingsForecastEffect.value.modeledBaselineWorkItems} modeled baseline work items**.`);
  out.push("");

  out.push("## Caveats / missing decision inputs");
  if (!brief.caveats.value.length) out.push("No explicit caveats from the owner reads.");
  for (const caveat of brief.caveats.value) out.push(`- **${caveat.code}** — ${caveat.message}`);
  out.push("", "---", `Immutable ${brief.version} · ${briefPayloadFingerprint(brief)} · generated ${brief.identity.generatedAt}`);
  return out.join("\n");
}

function decisionFallback(brief: DecisionBriefV1, findingId: string): string {
  return `/audit?project=${encodeURIComponent(brief.identity.project.value.id)}&select=${encodeURIComponent(`finding:${findingId}`)}`;
}

export function renderDecisionBriefPlainText(brief: DecisionBriefV1): string {
  return renderDecisionBriefMarkdown(brief)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^_([^\n]+)_$/gm, "$1")
    .replace(/`/g, "");
}
