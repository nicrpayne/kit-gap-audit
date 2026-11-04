"use client";

import React, { useState } from "react";
import { pauseScenarioWorkspace } from "@/lib/instrument/useProject";
import type { ScenarioPreviewRefusal as ScenarioPreviewRefusalState } from "@/lib/instrument/scenarioPreviewRefusal";
import SavedScenarios from "./SavedScenarios";

export default function ScenarioPreviewRefusal({
  refusal,
  surface,
}: {
  refusal: ScenarioPreviewRefusalState;
  surface: string;
}) {
  const [pauseError, setPauseError] = useState<string | null>(null);
  return (
    <div
      className="flex flex-1 items-center justify-center overflow-y-auto p-8"
      style={{ background: "var(--i-void)" }}
      data-shoot="scenario-preview-refused"
    >
      <section
        role="alert"
        data-attention="required"
        aria-live="assertive"
        className="w-full max-w-[640px] rounded-xl border p-6"
        style={{ background: "var(--i-panel)", borderColor: "var(--i-amber)" }}
      >
        <div className="i-label" style={{ color: "var(--i-amber)" }}>YOUR SCENARIO NEEDS REVIEW</div>
        <h1 className="mt-3 text-[22px] font-semibold text-[var(--i-text)]">Keep working in {surface}</h1>
        <div
          className="mt-4 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ background: "var(--i-panel-raised)", color: "var(--i-text-soft)" }}
        >
          Preview blocked · Reality baseline retained
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-[var(--i-text-soft)]">{refusal.message}</p>
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--i-text-faint)]">{refusal.action}</p>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--i-text-faint)]">
          Your staged Scenario remains intact. No staged Scope, estimate, Capacity, delivery date, or confidence overlay is shown as applied on this page.
        </p>
        <p className="mt-4 text-[13px] leading-relaxed text-[var(--i-text)]">Pause this what-if to use the live project now. Your draft stays in this tab, ready to reopen—no assumptions are accepted and no edits are discarded.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => { try { pauseScenarioWorkspace(); } catch (cause) { setPauseError(cause instanceof Error ? cause.message : "Could not pause safely. Your draft is unchanged."); } }}
            className="rounded-md px-4 py-3 text-[13px] font-semibold"
            style={{ background: "var(--i-amber)", color: "var(--i-void)" }}
            data-shoot="scenario-refusal-back-to-reality"
          >
            Pause Scenario · view Reality
          </button>
          <SavedScenarios />
        </div>
        {pauseError && <p role="alert" className="mt-3 text-sm text-[var(--i-red)]">{pauseError}</p>}
      </section>
    </div>
  );
}
