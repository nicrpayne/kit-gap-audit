import type { DecisionBriefV1 } from "./decisionBrief";

export function reportScheduleLines(brief: DecisionBriefV1): string[] {
  const schedule = brief.timeline.schedule;
  if (!schedule) return ["Full schedule was not captured in this historical report."];
  return [
    "Accepted schedule at generation — plans, commitments and forecasts remain distinct. These landmarks do not schedule resources or move the forecast.",
    ...(schedule.value.events.length ? schedule.value.events.map((event) =>
      `- ${event.title} · ${event.date}${event.endDate ? ` → ${event.endDate}` : ""} · ${event.temporalState} · ${event.semanticState ?? "event"} · ${event.sourceLabel ?? event.source ?? "source not recorded"}`)
      : ["No accepted schedule landmarks were recorded at generation."]),
  ];
}
