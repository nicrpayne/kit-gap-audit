"use client";

// THE INSPECTOR — what the selected moment actually was.
//
// It shows the REAL source record and nothing else. Where a moment belongs
// to another instrument, the inspector says so and opens a door rather than
// reproducing that instrument in miniature: a Report opens Forecast, a
// Decision opens Decisions, a lane opens Scope. Timeline does not become a
// second copy of the app.
//
// The language rule, applied throughout: adjacency is stated, causality is
// never claimed. A Report may say "since the previous report, 4 shipped, 1
// decision resolved" because those are counts the Report itself stored. It
// may not say a decision improved the date.

import { useState } from "react";
import type { TimelineEntry, TimelineCandidate, ForecastSnapshot } from "@/lib/timeline/entries";
import { fmtFull } from "@/lib/timeline/geometry";
import { FAMILY_COLOR } from "./TimeField";

// One panel material, shared by every inspector state — the recessed
// header and the raised body are what make it read as the same plug-in
// family as the Decisions inspector rather than a sidebar.
const PANEL = "h-full flex flex-col overflow-y-auto";
const PANEL_STYLE: React.CSSProperties = {
  borderLeft: "1px solid var(--i-border)",
  background: "linear-gradient(180deg, var(--i-panel) 0%, #12171a 100%)",
};
const HEAD_STYLE: React.CSSProperties = {
  borderBottom: "1px solid var(--i-border)",
  background: "var(--i-recess)",
  boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.03)",
};

const Row = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) => (
  <div className="flex items-baseline justify-between gap-3 py-[5px]" style={{ borderBottom: "1px solid var(--i-border)" }}>
    <span className="text-[8px] uppercase tracking-[0.14em] text-[var(--i-text-faint)] shrink-0">{label}</span>
    <span className="text-[11px] text-right" style={{ color: tone ?? "var(--i-text)" }}>{value}</span>
  </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mt-4">
    <div className="i-label mb-1.5">{title}</div>
    {children}
  </div>
);

function ReportBody({ snap, onOpenForecast }: { snap: ForecastSnapshot; onOpenForecast: () => void }) {
  const d = (s: string | null) => (s ? fmtFull(new Date(s).getTime()) : "—");
  const delta = snap.likelyDateDeltaDays;
  return (
    <>
      <Section title="What we believed then">
        <Row label="Generated" value={fmtFull(new Date(snap.generatedAt).getTime())} />
        <Row label="p10 earliest" value={d(snap.earliestDate)} />
        <Row label="p50 likely" value={d(snap.likelyDate)} tone="var(--i-violet)" />
        <Row label="p90 latest" value={d(snap.latestDate)} />
        <Row label="Target then" value={d(snap.targetDate)} tone="var(--i-amber)" />
        <Row
          label="Confidence"
          value={snap.confidenceAtTarget === null ? "—" : `${snap.confidenceAtTarget}%`}
        />
      </Section>

      {/* The Report's OWN stored counts, phrased as movement since the
          previous report. No attribution to any adjacent event. */}
      <Section title="Since previous report">
        <Row
          label="Likely date"
          value={delta === null ? "first report" : delta === 0 ? "unmoved" : `${delta > 0 ? "+" : ""}${delta} days`}
          tone={delta === null || delta === 0 ? undefined : delta < 0 ? "var(--i-mint)" : "var(--i-red)"}
        />
        <Row label="Shipped" value={snap.shippedCount} />
        <Row label="Blocking" value={snap.blockingCount} tone={snap.blockingCount > 0 ? "var(--i-red)" : undefined} />
        <Row label="Resolved" value={snap.resolvedSinceLastCount} />
      </Section>

      {snap.summaryMarkdown && (
        <Section title="Report summary">
          <div
            className="text-[10.5px] leading-[1.55] text-[var(--i-text-soft)] whitespace-pre-wrap rounded p-2 max-h-[190px] overflow-y-auto"
            style={{ background: "var(--i-recess)", border: "1px solid var(--i-border)" }}
          >
            {snap.summaryMarkdown.slice(0, 1400)}
          </div>
        </Section>
      )}

      <button
        onClick={onOpenForecast}
        data-shoot="open-forecast"
        className="mt-4 w-full rounded-md py-2 text-[11px] font-medium hover:brightness-110"
        style={{ background: "var(--i-violet)", color: "var(--i-void)" }}
      >
        Open Forecast
      </button>
    </>
  );
}

interface Props {
  entry: TimelineEntry | null;
  candidate: TimelineCandidate | null;
  laneName: string | null;
  onOpenForecast: (scopeId: string) => void;
  onOpenDecisions: (decisionId: string) => void;
  onAcceptCandidate: (id: string, date: string | null) => Promise<void>;
  onDismissCandidate: (id: string) => Promise<void>;
  onEditEvent: (entry: TimelineEntry) => void;
  busy: boolean;
}

export default function TimelineInspector({
  entry, candidate, laneName, onOpenForecast, onOpenDecisions,
  onAcceptCandidate, onDismissCandidate, onEditEvent, busy,
}: Props) {
  const [dateDraft, setDateDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (!entry && !candidate) {
    return (
      <div className={PANEL} style={PANEL_STYLE}>
        <div className="px-4 py-3" style={HEAD_STYLE}>
          <div className="i-label">Inspecting</div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-7 text-center gap-4">
          {/* The panel is furnished even when nothing is selected — an
              instrument with a blank slab down one side reads as broken,
              and the legend is the one thing worth saying here anyway. */}
          <div className="w-full rounded-md p-3" style={{ background: "var(--i-recess)", border: "1px solid var(--i-border)" }}>
            <div className="i-label mb-2">The score</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
              {[
                ["forecast", "Report"],
                ["decision", "Decision"],
                ["work", "Work done"],
                ["context", "Context"],
                ["landmark", "Landmark"],
                ["finding", "Finding"],
              ].map(([fam, label]) => (
                <div key={fam} className="flex items-center gap-1.5">
                  <span className="h-[7px] w-[7px] shrink-0" style={{ background: FAMILY_COLOR[fam], transform: "rotate(45deg)" }} />
                  <span className="text-[9px] text-[var(--i-text-soft)]">{label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <span className="h-[7px] w-[7px] shrink-0" style={{ border: "1px solid var(--i-text-faint)", transform: "rotate(45deg)" }} />
                <span className="text-[9px] text-[var(--i-text-soft)]">Planned</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-[7px] w-[7px] shrink-0" style={{ border: "1px dashed var(--i-violet)", transform: "rotate(45deg)" }} />
                <span className="text-[9px] text-[var(--i-text-soft)]">Candidate</span>
              </div>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--i-text-faint)]">
            Select a moment on the score, or press play and let the project tell it.
          </p>
        </div>
      </div>
    );
  }

  // ── CANDIDATE ─────────────────────────────────────────────────────
  if (candidate) {
    const needsDate = !candidate.date;
    return (
      <div className={PANEL} style={PANEL_STYLE}>
        <div className="px-4 py-3" style={HEAD_STYLE}>
          <div className="i-label">Inspecting · candidate</div>
          <div className="mt-1 text-[13px] leading-snug text-[var(--i-text)]">{candidate.title}</div>
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded px-1.5 py-[3px]"
            style={{ background: "var(--i-violet-soft)", border: "1px solid var(--i-violet)" }}>
            <span className="text-[8px] uppercase tracking-[0.14em]" style={{ color: "var(--i-violet)" }}>
              Not timeline reality
            </span>
          </div>
        </div>
        <div className="px-4 pb-4">
          <Section title="Provenance">
            <Row label="Source" value={candidate.sourceLabel} />
            <Row label="Proposed kind" value={candidate.kind} />
            <Row label="Proposed date" value={candidate.date ? fmtFull(new Date(candidate.date).getTime()) : "none — evidence does not say"} tone={needsDate ? "var(--i-amber)" : undefined} />
            <Row label="Project" value={laneName ?? "—"} />
          </Section>

          {candidate.excerpts.length > 0 && (
            <Section title="Evidence">
              {candidate.excerpts.map((x, i) => (
                <div key={i} className="text-[10.5px] leading-[1.5] text-[var(--i-text-soft)] rounded p-2 mb-1.5"
                  style={{ background: "var(--i-recess)", border: "1px solid var(--i-border)" }}>
                  “{x}”
                </div>
              ))}
            </Section>
          )}

          {needsDate && (
            <Section title="Date required">
              <p className="text-[10px] leading-relaxed text-[var(--i-text-faint)] mb-2">
                Nothing in the evidence says when this happened. Timeline will not infer a date
                from the statement, so this cannot be seated until you supply one.
              </p>
              <input
                type="date"
                value={dateDraft}
                onChange={(e) => { setDateDraft(e.target.value); setErr(null); }}
                data-shoot="candidate-date"
                className="w-full rounded px-2 py-1.5 text-[11px]"
                style={{ background: "var(--i-void)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
              />
            </Section>
          )}

          {err && <div className="mt-2 text-[10px]" style={{ color: "var(--i-red)" }}>{err}</div>}

          <div className="mt-4 flex gap-2">
            <button
              data-shoot="accept-candidate"
              disabled={busy || (needsDate && !dateDraft)}
              onClick={async () => {
                setErr(null);
                try {
                  await onAcceptCandidate(candidate.id, needsDate ? new Date(dateDraft).toISOString() : null);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Could not accept");
                }
              }}
              className="flex-1 rounded-md py-2 text-[11px] font-medium disabled:opacity-35 hover:brightness-110"
              style={{ background: "var(--i-violet)", color: "var(--i-void)" }}
            >
              Accept
            </button>
            <button
              data-shoot="dismiss-candidate"
              disabled={busy}
              onClick={() => onDismissCandidate(candidate.id)}
              className="rounded-md px-3 py-2 text-[11px] disabled:opacity-35"
              style={{ background: "var(--i-panel-raised)", border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── ENTRY ─────────────────────────────────────────────────────────
  const e = entry!;
  const detail = e.detail as Record<string, unknown>;
  const color = FAMILY_COLOR[e.family] ?? "var(--i-text)";
  const planned = e.temporalState === "planned";
  const overdue = Boolean(detail.overdue);

  const KIND_LABEL: Record<string, string> = {
    report: "Forecast report",
    decision_raised: "Decision raised",
    decision_gated: "Connected to delivery",
    decision_decided: "Decision decided",
    decision_needed_by: "Needed by · advisory",
    finding_raised: "Finding raised",
    finding_resolved: "Finding resolved",
    context_observed: "Context observed",
    work_completed: "Work completed",
    landmark: "Landmark",
  };

  return (
    <div className={PANEL} style={PANEL_STYLE}>
      <div className="px-4 py-3" style={HEAD_STYLE}>
        <div className="i-label">Inspecting</div>
        <div className="mt-1 flex items-start gap-2">
          <span className="mt-[5px] h-[7px] w-[7px] rounded-[1px] shrink-0" style={{ background: color, transform: "rotate(45deg)" }} />
          <div className="text-[13px] leading-snug text-[var(--i-text)]">{e.title}</div>
        </div>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <span className="text-[9px] uppercase tracking-[0.12em]" style={{ color }}>{KIND_LABEL[e.kind] ?? e.kind}</span>
          {planned && (
            <span
              data-shoot="planned-badge"
              className="text-[8px] uppercase tracking-[0.14em] rounded px-1.5 py-[2px]"
              style={{
                color: overdue ? "var(--i-red)" : "var(--i-text-soft)",
                border: `1px solid ${overdue ? "var(--i-red)" : "var(--i-border-strong)"}`,
              }}
            >
              {overdue ? "Overdue plan" : "Planned"}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        <Section title="When">
          <Row label="Date" value={fmtFull(new Date(e.date).getTime())} />
          {e.endDate && <Row label="Ends" value={fmtFull(new Date(e.endDate).getTime())} />}
          <Row label="Project" value={laneName ?? "—"} />
          <Row label="State" value={planned ? (overdue ? "planned · overdue" : "planned") : "occurred"} />
          {e.sourceLabel && <Row label="Source" value={e.sourceLabel} />}
        </Section>

        {e.kind === "report" && (
          <ReportBody snap={detail as unknown as ForecastSnapshot} onOpenForecast={() => onOpenForecast(e.scopeId)} />
        )}

        {e.family === "decision" && (
          <>
            <Section title="Decision">
              {typeof detail.owner === "string" && <Row label="Owner" value={detail.owner} />}
              {typeof detail.status === "string" && <Row label="Status" value={detail.status} />}
              {typeof detail.neededBy === "string" && <Row label="Needed by" value={fmtFull(new Date(detail.neededBy).getTime())} />}
              {typeof detail.metNeededBy === "boolean" && (
                <Row
                  label="Vs needed by"
                  value={detail.metNeededBy ? "decided on or before" : "decided after"}
                  tone={detail.metNeededBy ? "var(--i-mint)" : "var(--i-amber)"}
                />
              )}
              {typeof detail.resolution === "string" && detail.resolution && <Row label="Resolution" value={detail.resolution} />}
              {typeof detail.dependency === "string" && <Row label="What waits" value={detail.dependency} />}
              {typeof detail.targetScope === "string" && <Row label="Gated scope" value={detail.targetScope} />}
              {typeof detail.low === "number" && (
                <Row label="Gate estimate" value={`${detail.low} / ${detail.likely} / ${detail.high} days`} />
              )}
            </Section>
            {e.kind === "decision_needed_by" && (
              <p className="mt-3 text-[10px] leading-relaxed text-[var(--i-text-faint)]">
                Advisory only. A needed-by date feeds no simulation and adds no days to any forecast.
              </p>
            )}
            {typeof detail.evidenceForGate === "string" && (
              <Section title="Evidence for the gate">
                <div className="text-[10.5px] leading-[1.5] text-[var(--i-text-soft)] rounded p-2"
                  style={{ background: "var(--i-recess)", border: "1px solid var(--i-border)" }}>
                  {detail.evidenceForGate}
                </div>
              </Section>
            )}
            {Array.isArray(detail.evidence) && (detail.evidence as { excerpt: string; sourceLabel: string }[]).length > 0 && (
              <Section title="Evidence">
                {(detail.evidence as { excerpt: string; sourceLabel: string }[]).slice(0, 3).map((ev, i) => (
                  <div key={i} className="text-[10.5px] leading-[1.5] text-[var(--i-text-soft)] rounded p-2 mb-1.5"
                    style={{ background: "var(--i-recess)", border: "1px solid var(--i-border)" }}>
                    “{ev.excerpt}”
                    <div className="mt-1 text-[8.5px] text-[var(--i-text-faint)]">{ev.sourceLabel}</div>
                  </div>
                ))}
              </Section>
            )}
            <button
              onClick={() => onOpenDecisions(String(detail.decisionId))}
              data-shoot="open-decisions"
              className="mt-4 w-full rounded-md py-2 text-[11px] font-medium hover:brightness-110"
              style={{ background: "var(--i-amber)", color: "var(--i-void)" }}
            >
              Open Decisions
            </button>
          </>
        )}

        {e.kind === "context_observed" && (
          <>
            <Section title="Observation">
              <Row label="Source type" value={String(detail.sourceType ?? "—")} />
              <Row label="Producer" value={String(detail.producer ?? "—")} />
              <Row label="Observed at" value={fmtFull(new Date(String(detail.observedAt)).getTime())} />
              {typeof detail.detailNote === "string" && detail.detailNote && <Row label="Detail" value={detail.detailNote} />}
            </Section>
            {Array.isArray(detail.excerpts) && (detail.excerpts as string[]).length > 0 && (
              <Section title="Evidence">
                {(detail.excerpts as string[]).map((x, i) => (
                  <div key={i} className="text-[10.5px] leading-[1.5] text-[var(--i-text-soft)] rounded p-2 mb-1.5"
                    style={{ background: "var(--i-recess)", border: "1px solid var(--i-border)" }}>
                    “{x}”
                  </div>
                ))}
              </Section>
            )}
          </>
        )}

        {e.kind === "work_completed" && (
          <>
            <Section title="Work">
              <Row label="Identifier" value={String(detail.identifier ?? "—")} />
              <Row label="Completed" value={fmtFull(new Date(String(detail.completedAt)).getTime())} />
            </Section>
            <p className="mt-3 text-[10px] leading-relaxed text-[var(--i-text-faint)]">
              {String(detail.limitation ?? "")}
            </p>
          </>
        )}

        {e.kind === "landmark" && (
          <>
            <Section title="Landmark">
              <Row label="Kind" value={String(detail.landmarkKind ?? "event")} />
              <Row label="Added by" value={String(detail.source) === "candidate" ? "accepted candidate" : "hand"} />
              {typeof detail.note === "string" && detail.note && <Row label="Note" value={detail.note} />}
            </Section>
            <button
              onClick={() => onEditEvent(e)}
              data-shoot="edit-event"
              className="mt-4 w-full rounded-md py-2 text-[11px] font-medium hover:brightness-110"
              style={{ background: "var(--i-panel-raised)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
            >
              Edit landmark
            </button>
          </>
        )}

        {!e.editable && e.kind !== "report" && e.family !== "decision" && (
          <p className="mt-4 text-[10px] leading-relaxed text-[var(--i-text-faint)]">
            This moment is owned by the record it came from. Timeline shows it; it does not edit it.
          </p>
        )}
      </div>
    </div>
  );
}
