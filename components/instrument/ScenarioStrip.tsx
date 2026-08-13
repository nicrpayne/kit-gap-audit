"use client";

// The one strip that says which world you are in. Identical on every
// instrument that can hold a hypothetical, because "am I looking at Reality
// or at something I invented" must never be a per-screen puzzle.
//
// Reality is calm: neutral pill, no chips, nothing lit. Scenario is loud:
// violet pill, the assumptions listed as chips, and a Discard that always
// gets you home. Scenario never becomes Reality on its own -- committing is
// owned by the instrument that owns the underlying value (Portfolio for
// capacity), and this strip never grows a Commit button of its own.

import Link from "next/link";
import type { SuiteScenario } from "@/lib/instrument/useProject";

export interface ScenarioChip {
  id: string;
  label: string;
  /** Where this assumption can actually be edited or committed. */
  href?: string;
}

export default function ScenarioStrip({
  title,
  owns,
  active,
  chips,
  onDiscard,
  right,
}: {
  title: string;
  owns?: string;
  active: boolean;
  chips: ScenarioChip[];
  onDiscard: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div
      data-shoot="scenario-strip"
      className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 flex-wrap"
      style={{ background: "var(--i-panel)", borderBottom: "1px solid var(--i-border)" }}
    >
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{
          background: active ? "var(--i-violet-soft)" : "var(--i-panel-raised)",
          color: active ? "var(--i-violet)" : "var(--i-text-soft)",
        }}
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: active ? "var(--i-violet)" : "var(--i-text-faint)" }}
        />
        {active ? "Scenario" : "Reality"}
      </span>

      <span className="text-[12px] font-medium text-[var(--i-text)]">{title}</span>
      {!active && owns && <span className="text-[11px] text-[var(--i-text-faint)] truncate">{owns}</span>}

      {active &&
        chips.map((c) =>
          c.href ? (
            <Link
              key={c.id}
              href={c.href}
              className="rounded-full px-2.5 py-1 text-[11px] hover:brightness-125 transition-[filter]"
              style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)" }}
            >
              {c.label}
            </Link>
          ) : (
            <span
              key={c.id}
              className="rounded-full px-2.5 py-1 text-[11px]"
              style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)" }}
            >
              {c.label}
            </span>
          )
        )}

      <div className="flex-1" />
      {right}
      <button
        onClick={onDiscard}
        disabled={!active}
        data-shoot="discard"
        className="rounded-md px-2.5 py-1.5 text-[11px] text-[var(--i-text-soft)] hover:text-[var(--i-text)] disabled:opacity-25 transition-colors"
        style={{ border: "1px solid var(--i-border-strong)" }}
      >
        Back to Reality
      </button>
    </div>
  );
}

export function chipsFor(
  scenario: SuiteScenario,
  scopeNameById: Map<string, string>,
  itemCount: number,
  gateCount: number
): ScenarioChip[] {
  const chips: ScenarioChip[] = [];
  for (const [scopeId, fte] of Object.entries(scenario.capacityOverrideByScope)) {
    chips.push({
      id: `cap-${scopeId}`,
      label: `${scopeNameById.get(scopeId) ?? scopeId} at ${fte.toFixed(1)} FTE`,
      href: "/portfolio",
    });
  }
  if (itemCount > 0) {
    chips.push({ id: "scope", label: `${itemCount} item${itemCount === 1 ? "" : "s"} out of scope`, href: "/scope" });
  }
  if (gateCount > 0) {
    chips.push({
      id: "gates",
      label: `${gateCount} decision${gateCount === 1 ? "" : "s"} assumed resolved`,
      href: "/decisions",
    });
  }
  const reEstimated = Object.keys(scenario.estimateOverrideByItemId).length;
  if (reEstimated > 0) {
    chips.push({
      id: "estimates",
      label: `${reEstimated} re-estimated`,
      href: "/scope",
    });
  }
  if (scenario.contextSwitchCostPct !== null) {
    chips.push({ id: "switch", label: `switch cost ${scenario.contextSwitchCostPct}%`, href: "/portfolio" });
  }
  return chips;
}
