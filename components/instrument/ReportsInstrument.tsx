"use client";

// REPORTS — how do I communicate the current model? Communicate the model.
//
// Reports are OUTPUT. They reflect the model; they never shape it, and no
// reporting requirement is allowed to add a control to a live operating
// surface. So this instrument is deliberately the calmest in the suite: a
// list of what was actually said, and a readable rendering of one of them.
//
// The rendered report is the stored markdown, verbatim — a past report must
// stay exactly what was reported, even as the underlying logic moves on.

import { useMemo, useState } from "react";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import { Panel, Stat, Prototype } from "@/components/instrument/Panel";
import { useProject, fmtFull, fmtDay, deltaLabel, deltaTone, confidenceTone } from "@/lib/instrument/useProject";

export default function ReportsInstrument() {
  const m = useProject();
  const [selected, setSelected] = useState<string | null>(null);

  const scopeNameById = useMemo(() => new Map((m.data?.scopes ?? []).map((s) => [s.scopeId, s.name])), [m.data]);
  const reports = m.data?.reports ?? [];
  const current = reports.find((r) => r.id === selected) ?? reports[0] ?? null;

  if (!m.data)
    return (
      <InstrumentShell>
        <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--i-text-faint)]">
          {m.error ?? "Loading…"}
        </div>
      </InstrumentShell>
    );

  return (
    <InstrumentShell scopes={m.data.scopes.map((s) => ({ scopeId: s.scopeId, name: s.name }))}>
      <div className="flex-1 min-h-0 flex gap-3 p-3 overflow-hidden">
        <div className="shrink-0 w-[268px] flex flex-col gap-3 overflow-auto">
          <Panel title="Briefings" subtitle={`${reports.length} on record`} accent="var(--i-mint)" dense>
            <ul className="space-y-px">
              {reports.map((r) => {
                const sel = current?.id === r.id;
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelected(r.id)}
                      className="w-full text-left rounded px-2 py-2 transition-colors"
                      style={{ background: sel ? "rgba(243,240,230,0.05)" : "transparent" }}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className="text-[11.5px] truncate"
                          style={{ color: sel ? "var(--i-text)" : "var(--i-text-soft)" }}
                        >
                          {scopeNameById.get(r.scopeId) ?? r.scopeId}
                        </span>
                        <span className="shrink-0 text-[10px] text-[var(--i-text-faint)]">
                          {fmtDay(new Date(r.generatedAt))}
                        </span>
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="i-readout text-[11px] text-[var(--i-text-soft)]">
                          {fmtDay(new Date(r.likelyDate))}
                        </span>
                        {r.likelyDateDeltaDays !== null && r.likelyDateDeltaDays !== 0 && (
                          <span className="text-[10px]" style={{ color: deltaTone(r.likelyDateDeltaDays) }}>
                            {deltaLabel(r.likelyDateDeltaDays)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
              {reports.length === 0 && (
                <li className="text-[11.5px] text-[var(--i-text-faint)] p-2">No reports generated yet.</li>
              )}
            </ul>
          </Panel>

          <Panel title="Share" accent="var(--i-text-faint)" dense actions={<Prototype note="Export and share targets aren't wired yet." />}>
            <div className="p-1 space-y-1.5">
              {["Copy as markdown", "Export PDF", "Post to Slack"].map((a) => (
                <button
                  key={a}
                  disabled
                  className="w-full rounded-md px-2.5 py-2 text-left text-[11px] text-[var(--i-text-faint)] disabled:cursor-not-allowed"
                  style={{ border: "1px solid var(--i-border)" }}
                >
                  {a}
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <div className="flex-1 min-w-0 overflow-auto">
          {current ? (
            <Panel
              title={scopeNameById.get(current.scopeId) ?? "Report"}
              subtitle={`generated ${fmtFull(new Date(current.generatedAt))}`}
              accent="var(--i-mint)"
              dataShoot="report-body"
            >
              <div
                className="grid gap-px mb-4"
                style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))", background: "var(--i-border)", borderRadius: 6 }}
              >
                {[
                  <Stat key="a" label="Reported landing" size={18} value={fmtDay(new Date(current.likelyDate))} />,
                  <Stat
                    key="b"
                    label="Confidence"
                    size={18}
                    value={current.confidenceAtTarget === null ? "—" : `${current.confidenceAtTarget}%`}
                    tone={confidenceTone(current.confidenceAtTarget)}
                  />,
                  <Stat key="c" label="Shipped since" size={18} value={String(current.shippedCount)} />,
                  <Stat
                    key="d"
                    label="Blocking then"
                    size={18}
                    value={String(current.blockingCount)}
                    tone={current.blockingCount ? "var(--i-amber)" : undefined}
                  />,
                ].map((el, i) => (
                  <div key={i} className="px-3.5 py-2.5" style={{ background: "var(--i-panel)" }}>
                    {el}
                  </div>
                ))}
              </div>

              {/* Stored text, rendered plainly. Long-form reads best at a
                  comfortable measure, not stretched across the workspace. */}
              <article
                className="text-[13px] leading-[1.75] text-[var(--i-text-soft)] whitespace-pre-wrap"
                style={{ maxWidth: "68ch" }}
              >
                {current.summaryMarkdown}
              </article>

              <p className="mt-5 text-[10px] text-[var(--i-text-faint)] leading-relaxed" style={{ maxWidth: "68ch" }}>
                This is the text exactly as it was generated. It is not recomputed on view — a past briefing stays
                what was actually reported, even after the model has moved on.
              </p>
            </Panel>
          ) : (
            <Panel title="Nothing to show" accent="var(--i-text-faint)">
              <p className="text-[11.5px] text-[var(--i-text-faint)]">
                No reports on record yet. Reports are generated against a scope&rsquo;s saved forecast.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </InstrumentShell>
  );
}
