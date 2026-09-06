import type { DecisionBriefV1, SourceStamp } from "./decisionBrief";
import { briefPayloadFingerprint } from "./decisionBriefRender";
import type { BriefModuleId, BriefRecipeV1, ModuleDensity } from "./composer";
import { buildBriefPresentation, sourceForModule } from "./presentation";

const date = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  : "MISSING";
const number = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2);
const stamp = (source: SourceStamp) => `${source.owner} · ${source.temporalRole.toUpperCase()} · as of ${date(source.asOf)} · ${source.currentness.toUpperCase()}`;

function moduleMarkdown(id: BriefModuleId, density: ModuleDensity, brief: DecisionBriefV1, recipe: BriefRecipeV1): string[] {
  const out: string[] = [];
  const presentation = buildBriefPresentation(brief, recipe);
  const window = brief.headline.likelyWindow.value;
  const movement = brief.headline.movement.value;
  const source = sourceForModule(brief, id);
  const heading = (title: string) => out.push(`## ${title}`, `_${stamp(source)}_`, "");
  const detail = density !== "headline";
  const expanded = density === "expanded";

  switch (id) {
    case "delivery-outlook":
      heading("Delivery outlook");
      out.push(`**Likely ${date(window.likely)} · ${date(window.earliest)}–${date(window.latest)}**`);
      out.push(`Target ${date(brief.headline.targetDate.value)} · confidence ${brief.headline.confidenceAtTarget.value === null ? "UNAVAILABLE" : `${brief.headline.confidenceAtTarget.value}%`} · ${brief.identity.mode.toUpperCase()}`);
      if (detail) out.push("", brief.headline.keyReason.value);
      break;
    case "signal-read":
      heading("Signal's Read");
      out.push(presentation.signalRead);
      break;
    case "why-this-date":
      heading("Why this date");
      for (const driver of presentation.drivers.slice(0, expanded ? 4 : 2)) out.push(`- **[${driver.label}](${driver.href})** — ${driver.detail}`);
      break;
    case "commitment":
      heading("Commitment");
      out.push(`- Likely: ${date(window.likely)}`);
      out.push(`- Target: ${date(brief.headline.targetDate.value)}`);
      out.push(`- Committed delivery date: **${presentation.commitment.label}**`);
      break;
    case "movement":
      heading("Movement");
      out.push(movement ? `Since saved brief ${movement.comparedToReportId}: **${Math.abs(movement.days)} day${Math.abs(movement.days) === 1 ? "" : "s"} ${movement.days < 0 ? "earlier" : movement.days > 0 ? "later" : "unchanged"}**${movement.confidencePoints === null ? "" : `; confidence ${movement.confidencePoints >= 0 ? "+" : ""}${movement.confidencePoints} points`}.` : "No comparable saved brief; no trend claim.");
      break;
    case "what-changed": {
      heading("What changed");
      const audit = brief.changes.audit.value;
      out.push(`- Audit: ${audit.newFindings.length} new · ${audit.resolvedFindings.length} resolved/handled.`);
      out.push(`- Delivery: ${brief.changes.delivery.value.shipped.length} canonically shipped item${brief.changes.delivery.value.shipped.length === 1 ? "" : "s"}.`);
      if (expanded) {
        for (const finding of audit.newFindings) out.push(`  - New Finding: ${finding.title}`);
        for (const item of brief.changes.delivery.value.shipped) out.push(`  - [${item.identifier} · ${item.title}](${item.href})`);
      }
      break;
    }
    case "acceleration-levers":
      heading("Acceleration levers");
      if (!brief.movable.scenarioOptions.value.length) out.push("- UNAVAILABLE — no Forecast-owned scenario consequence exists.");
      for (const option of brief.movable.scenarioOptions.value) out.push(`- **${option.label}** — likely ${date(option.likelyDate)} · ${Math.abs(option.deltaDays)}d ${option.deltaDays < 0 ? "sooner" : option.deltaDays > 0 ? "later" : "unchanged"} · confidence ${option.confidenceAtTarget === null ? "UNAVAILABLE" : `${option.confidenceAtTarget}%`}`);
      break;
    case "leadership-asks":
      heading("Leadership asks");
      if (!presentation.leadershipAsks.length) out.push("No operator-confirmed leadership asks.");
      for (const ask of presentation.leadershipAsks) out.push(`- **[${ask.label}](${ask.href})** · owner ${ask.owner ?? "UNASSIGNED"} · needed ${date(ask.neededBy)} · ${ask.gated ? "GATED" : "UNGATED"}`);
      if (presentation.leadershipAskCandidates.length) {
        out.push("", "Candidates — operator confirmation required:");
        for (const ask of presentation.leadershipAskCandidates) out.push(`- [${ask.label}](${ask.href})`);
      }
      break;
    case "next":
      heading("What's next");
      out.push(brief.timeline.nextMilestone.value ? `- ${brief.timeline.nextMilestone.value.title} · ${date(brief.timeline.nextMilestone.value.date)}` : "- Next milestone: MISSING.");
      if (brief.calls.decisions.value[0]) out.push(`- Nearest call: [${brief.calls.decisions.value[0].title}](${brief.calls.decisions.value[0].href})`);
      break;
    case "decisions":
      heading("Decisions");
      if (!brief.calls.decisions.value.length) out.push("No first-class open Decisions.");
      for (const decision of brief.calls.decisions.value) {
        out.push(`- **[${decision.title}](${decision.href})** · ${decision.gated ? `GATED · ${number(decision.modeledDelay.low)}/${number(decision.modeledDelay.likely)}/${number(decision.modeledDelay.high)}d` : "UNGATED · 0 modeled days"} · owner ${decision.owner ?? "UNASSIGNED"}`);
        if (expanded && decision.gate) out.push(`  - Target [${decision.gate.targetScopeName}](${decision.targetScopeHref!}) · \`${decision.gate.targetScopeId}\``);
      }
      break;
    case "dependencies":
      heading("Dependencies");
      if (!brief.calls.dependencies.value.length) out.push("No declared dependencies in the snapshot.");
      for (const dependency of brief.calls.dependencies.value) out.push(`- [${dependency.name}](${dependency.href}) · ${dependency.likelyDate ? `likely ${date(dependency.likelyDate)}` : "current consequence UNAVAILABLE"}`);
      break;
    case "scope": {
      heading("Executable Scope");
      const scope = brief.movable.scope.value;
      out.push(`**${scope.executableItemCount} canonical work items · ${number(scope.remainingEffortDays.low)}/${number(scope.remainingEffortDays.likely)}/${number(scope.remainingEffortDays.high)} effort days** · [Open Scope](${scope.href})`);
      break;
    }
    case "capacity": {
      heading("Capacity");
      const capacity = brief.movable.capacity.value;
      if (capacity.availability !== "available") out.push(`**Named Capacity ${capacity.availability.toUpperCase()}** · Forecast uses ${number(capacity.forecastEffectiveFte)} FTE from ${capacity.source}; this is not a named-staffing claim.`);
      else {
        out.push(`**${number(capacity.namedRawFte!)} raw → ${number(capacity.namedEffectiveFte!)} effective → ${number(capacity.forecastEffectiveFte)} Forecast FTE**`);
        if (expanded) for (const person of capacity.contributors) out.push(`- ${person.name}: ${number(person.rawFte)} raw / ${number(person.effectiveFte)} effective FTE`);
      }
      break;
    }
    case "timeline":
      heading("Timeline");
      out.push(`**Current Forecast · LIVE** — [likely ${date(brief.timeline.currentForecast.value.likelyDate)}](${brief.timeline.currentForecast.value.href})`);
      out.push(brief.timeline.nextMilestone.value ? `Next milestone: ${brief.timeline.nextMilestone.value.title} · ${date(brief.timeline.nextMilestone.value.date)}` : "Next milestone: MISSING.");
      for (const conflict of brief.timeline.conflicts.value) out.push(`- Conflict: ${conflict.title} · ${date(conflict.date)}`);
      break;
    case "audit-delta":
      heading("Audit delta");
      out.push(`Runs: ${brief.changes.audit.value.priorRunId ?? "MISSING"} → ${brief.changes.audit.value.currentRunId ?? "MISSING"}`);
      out.push(`New ${brief.changes.audit.value.newFindings.length} · resolved/handled ${brief.changes.audit.value.resolvedFindings.length}.`);
      if (expanded) for (const finding of brief.changes.audit.value.newFindings) out.push(`- New: ${finding.title}`);
      break;
    case "evidence":
      heading("Evidence & grounding");
      if (!brief.evidence.references.value.length) out.push("Evidence references: MISSING.");
      for (const reference of brief.evidence.references.value) out.push(`- [${reference.title}](${reference.href}) · ${reference.grounding.toUpperCase()} · ${reference.currentness.toUpperCase()}`);
      break;
    case "source-health":
      heading("Source health");
      for (const item of brief.identity.sourceSnapshots) out.push(`- ${stamp(item)}${item.sourceId ? ` · ${item.sourceId}` : ""}`);
      break;
    case "caveats":
      heading("Missing inputs / caveats");
      if (!brief.caveats.value.length) out.push("No explicit caveats from the owner reads.");
      for (const caveat of brief.caveats.value) out.push(`- **${caveat.code}** — ${caveat.message}`);
      break;
    case "operator-note":
      heading("Operator note");
      out.push(recipe.operatorNote ?? "No operator-authored note.");
      break;
  }
  out.push("");
  return out;
}

export function renderAudienceBriefMarkdown(brief: DecisionBriefV1, inputRecipe: unknown): string {
  const presentation = buildBriefPresentation(brief, inputRecipe);
  const out = [
    `# ${presentation.projectName} — ${presentation.audienceLabel} Brief`,
    `**${presentation.purposeLabel} · ${brief.identity.mode.toUpperCase()} · generated ${date(brief.identity.generatedAt)} · ${presentation.snapshotFingerprint}**`,
    "",
  ];
  for (const item of presentation.modules) out.push(...moduleMarkdown(item.id, item.density, brief, presentation.recipe));
  out.push("---", `Immutable ${brief.version} + ${presentation.version} · ${briefPayloadFingerprint(brief)} · generated ${brief.identity.generatedAt}`);
  return out.join("\n");
}

export function renderAudienceBriefPlainText(brief: DecisionBriefV1, recipe: unknown): string {
  return renderAudienceBriefMarkdown(brief, recipe)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^_([^\n]+)_$/gm, "$1")
    .replace(/`/g, "");
}
