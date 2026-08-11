"use client";

// The Inspector answers "why", and only "why".
//
// It used to also carry the Capacity Control and the Target control. Those
// moved: capacity is a fader in the Instrument Bay (it is a lever, and
// levers belong together where your hand is), and the target is scrubbed
// directly on the Forecast Field (it is a date, and dates belong on the
// timeline). What is left here is narration -- momentum attribution,
// knock-on effects, the plain-language explanation, and Hermes -- which is
// why the panel is deliberately quieter than everything to its left and can
// be collapsed away entirely.
//
// Everything rendered is either state the parent already computed or a
// callback up to it; this component runs no simulation of its own.

import { useMemo } from "react";
import type { SimulationResult } from "@/lib/forecast/simulate";
import { explainScope, type DependencyDelta, type DependentDelta } from "@/lib/portfolio/explain";
import {
  DIRECTION_GLYPH,
  DIRECTION_LABEL,
  directionTone,
  trendPhrase,
  type MomentumTrend,
} from "@/lib/momentum/trend";
import AskChips from "@/components/AskChips";

export interface InspectorScope {
  scopeId: string;
  name: string;
  targetDate: string | null;
  capacitySource: "allocations" | "explicit" | "inferred";
}

interface ScenarioInspectorProps {
  scope: InspectorScope;
  baseline: SimulationResult | undefined;
  preview: SimulationResult | undefined;
  dirty: boolean;
  anonymousFteAdded: number;
  namedFteChanged: boolean;
  dependsOn: DependencyDelta[];
  dependents: DependentDelta[];
  trend: MomentumTrend | null;
  onCollapse: () => void;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function moveColor(deltaDays: number): string {
  return deltaDays < 0 ? "var(--i-mint)" : deltaDays > 0 ? "var(--i-red)" : "var(--i-text-soft)";
}

const CAPACITY_SOURCE_LABEL: Record<InspectorScope["capacitySource"], string> = {
  allocations: "tracked by named people",
  explicit: "a set number",
  inferred: "inferred from Linear",
};

export default function ScenarioInspector({
  scope,
  baseline,
  preview,
  dirty,
  anonymousFteAdded,
  namedFteChanged,
  dependsOn,
  dependents,
  trend,
  onCollapse,
}: ScenarioInspectorProps) {
  const active = preview ?? baseline;
  const deltaDays =
    dirty && baseline && active
      ? Math.round((active.likelyDate.getTime() - baseline.likelyDate.getTime()) / 86400000)
      : 0;

  const explanation = useMemo(
    () =>
      explainScope({
        scopeName: scope.name,
        deltaDays,
        anonymousFteAdded,
        namedFteChanged,
        dependsOn,
        dependents,
      }),
    [scope.name, deltaDays, anonymousFteAdded, namedFteChanged, dependsOn, dependents]
  );

  return (
    <aside
      className="shrink-0 hidden xl:flex flex-col overflow-y-auto"
      style={{ width: 296, background: "var(--i-bg)", borderLeft: "1px solid var(--i-border)" }}
      aria-label={`${scope.name} detail`}
    >
      <div className="flex items-start justify-between px-4 pt-3.5 pb-3" style={{ borderBottom: "1px solid var(--i-border)" }}>
        <div className="min-w-0">
          <div className="i-label">Inspecting</div>
          <div className="mt-1.5 text-[13px] font-medium text-[var(--i-text)] truncate">{scope.name}</div>
          {active && (
            <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
              <span className="i-readout text-[20px] leading-none" style={{ color: dirty ? "var(--i-violet)" : "var(--i-text)" }}>
                {formatDate(active.likelyDate)}
              </span>
              {dirty && deltaDays !== 0 && (
                <span className="text-[11px] font-medium" style={{ color: moveColor(deltaDays) }}>
                  {deltaDays < 0 ? `${Math.abs(deltaDays)}d earlier` : `${deltaDays}d later`}
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onCollapse}
          aria-label="Collapse inspector"
          title="Collapse inspector"
          className="shrink-0 h-6 w-6 rounded flex items-center justify-center text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
        >
          ›
        </button>
      </div>

      {/* Momentum attribution -- only facts that came out of stored reports. */}
      {trend && (
        <section className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
          <div className="i-label mb-2">Why momentum is {DIRECTION_LABEL[trend.direction].toLowerCase()}</div>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="i-readout text-[15px] leading-none" style={{ color: directionTone(trend.direction) }}>
              {DIRECTION_GLYPH[trend.direction]}
            </span>
            <span className="text-[11px] text-[var(--i-text-soft)]">{trendPhrase(trend)}</span>
          </div>
          {trend.dateUnchangedButImproving && (
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--i-mint)]">
              The headline date hasn&rsquo;t moved yet, but the odds behind it improved — worth saying out loud
              before someone reads &ldquo;no change&rdquo; as &ldquo;no progress.&rdquo;
            </p>
          )}
          {trend.drivers.length > 0 ? (
            <ul className="mt-2.5 space-y-1.5">
              {trend.drivers.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-[11.5px] leading-snug">
                  <span
                    aria-hidden
                    className="mt-[3px] shrink-0"
                    style={{ color: d.tone === "good" ? "var(--i-mint)" : d.tone === "bad" ? "var(--i-red)" : "var(--i-text-faint)" }}
                  >
                    {d.tone === "good" ? "+" : d.tone === "bad" ? "−" : "·"}
                  </span>
                  <span className="text-[var(--i-text-soft)]">{d.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] text-[var(--i-text-faint)]">
              Nothing in the last report moved enough to attribute.
            </p>
          )}
        </section>
      )}

      {dependents.length > 0 && (
        <section className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
          <div className="i-label mb-2">Effect on portfolio</div>
          <ul className="space-y-1.5">
            {dependents.map((d) => (
              <li key={d.scopeId} className="flex items-center justify-between text-[12px]">
                <span className="text-[var(--i-text-soft)] truncate pr-2">{d.name}</span>
                <span className="font-medium tabular-nums shrink-0" style={{ color: moveColor(d.deltaDays) }}>
                  {d.deltaDays === 0 ? "no change" : d.deltaDays < 0 ? `${Math.abs(d.deltaDays)}d earlier` : `${d.deltaDays}d later`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
        <div className="i-label mb-2">Why this date</div>
        {explanation.length > 0 ? (
          <ul className="space-y-2">
            {explanation.map((line, i) => (
              <li key={i} className="text-[11.5px] text-[var(--i-text-soft)] leading-relaxed">
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11.5px] text-[var(--i-text-faint)] leading-relaxed">
            Nothing in this scenario is affecting {scope.name}. Capacity here is{" "}
            {CAPACITY_SOURCE_LABEL[scope.capacitySource]}.
          </p>
        )}
      </section>

      <section className="px-4 py-3.5">
        <div className="i-label mb-2">Ask Hermes</div>
        <p className="text-[10.5px] text-[var(--i-text-faint)] mb-2 leading-relaxed">
          Answers about {scope.name}&rsquo;s saved forecast — Hermes doesn&rsquo;t see this unsaved scenario yet.
        </p>
        <div className="instrument-ask">
          <AskChips scopeId={scope.scopeId} hasTargetDate={!!scope.targetDate} />
        </div>
      </section>
    </aside>
  );
}
