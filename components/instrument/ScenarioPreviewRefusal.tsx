"use client";

import React from "react";
import type { ScenarioPreviewRefusal as ScenarioPreviewRefusalState } from "@/lib/instrument/scenarioPreviewRefusal";

export default function ScenarioPreviewRefusal({
  refusal,
  surface,
  onBackToReality,
}: {
  refusal: ScenarioPreviewRefusalState;
  surface: string;
  onBackToReality?: () => void;
}) {
  return (
    <div
      className="flex flex-1 items-center justify-center overflow-y-auto p-8"
      style={{ background: "var(--i-void)" }}
      data-shoot="scenario-preview-refused"
    >
      <section
        role="alert"
        aria-live="assertive"
        className="w-full max-w-[640px] rounded-xl border p-6"
        style={{ background: "var(--i-panel)", borderColor: "var(--i-amber)" }}
      >
        <div className="i-label" style={{ color: "var(--i-amber)" }}>SCENARIO PREVIEW REFUSED</div>
        <h1 className="mt-3 text-[22px] font-semibold text-[var(--i-text)]">{surface} is not applying this Scenario</h1>
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
        {onBackToReality && (
          <button
            type="button"
            onClick={onBackToReality}
            className="mt-5 rounded-md px-3 py-2 text-[11px] font-semibold"
            style={{ background: "var(--i-amber)", color: "var(--i-void)" }}
            data-shoot="scenario-refusal-back-to-reality"
          >
            Back to Reality
          </button>
        )}
      </section>
    </div>
  );
}
