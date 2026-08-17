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
import { spokenSourceLabel } from "@/lib/timeline/producer";
import { labelFor } from "@/lib/timeline/moment";
import { FAMILY_COLOR } from "./TimeField";

// One panel material, shared by every inspector state — the recessed
// header and the raised body are what make it read as the same plug-in
// family as the Decisions inspector rather than a sidebar.
/** What the inspector costs when nothing is held. Wide enough to read as a
    deliberate edge, narrow enough that the canvas keeps the screen. */
export const SEAM_W = 26;
export const PANEL_W = 316;

const PANEL = "h-full flex flex-col overflow-y-auto";

/** Put it down. Small, top-right, and out of the way until wanted. */
function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      data-shoot="inspector-close"
      aria-label="Close inspector"
      title="Close (esc)"
      className="absolute right-2.5 top-2.5 rounded p-1 hover:brightness-150 transition-[filter]"
      style={{ color: "var(--i-text-faint)" }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M2 2 L8 8 M8 2 L2 8" />
      </svg>
    </button>
  );
}
const PANEL_STYLE: React.CSSProperties = {
  borderLeft: "1px solid var(--i-border)",
  background: "linear-gradient(180deg, var(--i-panel) 0%, #12171a 100%)",
};
const HEAD_STYLE: React.CSSProperties = {
  borderBottom: "1px solid var(--i-border)",
  background: "var(--i-recess)",
  boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.03)",
};

// Facts sit in a recessed well, not on a stack of hairlines. A row of
// horizontal rules reads as a database dump; a cut-in panel reads as an
// instrument readout, which is what these numbers are.
const Row = ({ label, value, tone, big }: { label: string; value: React.ReactNode; tone?: string; big?: boolean }) => (
  <div className="flex items-baseline justify-between gap-3 px-2.5 py-[6px]">
    <span className="text-[8px] uppercase tracking-[0.14em] text-[var(--i-text-faint)] shrink-0">{label}</span>
    <span
      className={big ? "i-readout text-[13px] text-right" : "text-[11px] text-right"}
      style={{ color: tone ?? "var(--i-text)" }}
    >
      {value}
    </span>
  </div>
);

const Well = ({ children }: { children: React.ReactNode }) => (
  <div
    className="rounded-md overflow-hidden divide-y"
    style={{
      background: "var(--i-recess)",
      border: "1px solid #1c2227",
      boxShadow: "inset 0 2px 7px rgba(0,0,0,0.6)",
      borderColor: "rgba(38,45,51,0.55)",
    }}
  >
    {children}
  </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mt-3.5">
    <div className="i-label mb-1.5">{title}</div>
    {children}
  </div>
);

const Quote = ({ children, label }: { children: React.ReactNode; label?: string }) => (
  <div
    className="rounded-md p-2.5 mb-1.5"
    style={{ background: "var(--i-recess)", border: "1px solid #1c2227", boxShadow: "inset 0 2px 6px rgba(0,0,0,0.55)" }}
  >
    <div className="text-[10.5px] leading-[1.55] text-[var(--i-text-soft)]">{children}</div>
    {label && <div className="mt-1.5 text-[8.5px] text-[var(--i-text-faint)]">{label}</div>}
  </div>
);

const Door = ({ onClick, shoot, color, children }: { onClick: () => void; shoot: string; color: string; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    data-shoot={shoot}
    className="mt-4 w-full rounded-md py-2.5 text-[11px] font-medium hover:brightness-110 transition-[filter]"
    style={{
      background: `linear-gradient(180deg, ${color} 0%, color-mix(in srgb, ${color} 78%, #000) 100%)`,
      color: "var(--i-void)",
      boxShadow: `0 2px 10px color-mix(in srgb, ${color} 34%, transparent), inset 0 1px 0 rgba(255,255,255,0.32)`,
    }}
  >
    {children}
  </button>
);

function ReportBody({ snap, onOpenForecast }: { snap: ForecastSnapshot; onOpenForecast: () => void }) {
  const d = (s: string | null) => (s ? fmtFull(new Date(s).getTime()) : "—");
  const delta = snap.likelyDateDeltaDays;
  return (
    <>
      {/* The remembered landing, as an instrument readout: p50 dominant,
          the range around it, the target it was measured against. */}
      <Section title="What we believed then">
        <div
          className="rounded-md px-3 py-3 mb-1.5"
          style={{
            background: "linear-gradient(180deg, #191527 0%, #101018 100%)",
            border: "1px solid rgba(155,140,250,0.4)",
            boxShadow: "inset 0 2px 9px rgba(0,0,0,0.6)",
          }}
        >
          <div className="text-[8px] uppercase tracking-[0.18em]" style={{ color: "var(--i-violet)" }}>p50 likely</div>
          <div className="i-readout text-[21px] leading-none mt-1.5" style={{ color: "var(--i-violet)" }}>
            {d(snap.likelyDate)}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            <span className="i-readout text-[10px] text-[var(--i-text-soft)]">{d(snap.earliestDate)}</span>
            <div className="flex-1 h-[6px] rounded-full relative" style={{ background: "#070a0c" }}>
              <div className="absolute inset-y-0 left-0 right-0 rounded-full"
                style={{ background: "linear-gradient(90deg, rgba(155,140,250,0.1), rgba(155,140,250,0.45), rgba(155,140,250,0.1))" }} />
              <div className="absolute top-[-3px] bottom-[-3px] w-[3px] rounded-sm" style={{ left: "50%", background: "var(--i-violet)" }} />
            </div>
            <span className="i-readout text-[10px] text-[var(--i-text-soft)]">{d(snap.latestDate)}</span>
          </div>
          <div className="mt-1 flex justify-between text-[7.5px] uppercase tracking-[0.14em] text-[var(--i-text-faint)]">
            <span>p10</span><span>p90</span>
          </div>
        </div>
        <Well>
          <Row label="Generated" value={fmtFull(new Date(snap.generatedAt).getTime())} />
          <Row label="Target then" value={d(snap.targetDate)} tone="var(--i-amber)" big />
          <Row
            label="Confidence"
            value={snap.confidenceAtTarget === null ? "—" : `${snap.confidenceAtTarget}%`}
            big
          />
        </Well>
      </Section>

      {/* The Report's OWN stored counts, phrased as movement since the
          previous report. No attribution to any adjacent event. */}
      <Section title="Since previous report">
        <Well>
        <Row
          label="Likely date"
          value={delta === null ? "first report" : delta === 0 ? "unmoved" : `${delta > 0 ? "+" : ""}${delta} days`}
          tone={delta === null || delta === 0 ? undefined : delta < 0 ? "var(--i-mint)" : "var(--i-red)"}
        />
        <Row label="Shipped" value={snap.shippedCount} />
        <Row label="Blocking" value={snap.blockingCount} tone={snap.blockingCount > 0 ? "var(--i-red)" : undefined} />
        <Row label="Resolved" value={snap.resolvedSinceLastCount} />
        </Well>
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

      <Door onClick={onOpenForecast} shoot="open-forecast" color="#9b8cfa">Open Forecast</Door>
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
  /** Establish a dateless candidate's timing WITHOUT placing it. Answering
      "when" must not also answer "which project". */
  onSupplyTiming: (id: string, iso: string) => void;
  /** The timing this session has supplied for the selected candidate, if
      any — so the panel can say the piece is now draggable. */
  suppliedDate: string | null;
  onDismissCandidate: (id: string) => Promise<void>;
  onEditEvent: (entry: TimelineEntry) => void;
  /** Put the held thing down. Escape and an empty-field click do the same. */
  onClose: () => void;
  busy: boolean;
}

export default function TimelineInspector({
  entry, candidate, laneName, onOpenForecast, onOpenDecisions,
  onAcceptCandidate, onSupplyTiming, suppliedDate, onDismissCandidate, onEditEvent, onClose, busy,
}: Props) {
  const [dateDraft, setDateDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // NOTHING SELECTED, NOTHING TO SHOW.
  //
  // A 316px panel whose entire content was "press play" was asking a third
  // of the canvas to hold an instruction. Detail is a consequence of
  // picking something up, so when nothing is held there is no panel — only
  // a seam at the edge saying depth is there. The canvas takes the space
  // back, which is what the canvas is for.
  if (!entry && !candidate) {
    return (
      <div
        data-shoot="inspector-seam"
        className="h-full flex flex-col items-center justify-center select-none"
        style={{ width: SEAM_W, borderLeft: "1px solid var(--i-border)", background: "var(--i-void)" }}
        aria-label="Inspect"
        title="Select anything on the score to inspect it"
      >
        {/* A GRIP, NOT A WORD.
            The seam used to paint "Inspect" vertically down the edge — a
            label doing a job the shape should do, and the only piece of
            rotated type on the whole instrument. A machined pull grip says
            "there is a panel folded away here" in the language everything
            else on this surface is already speaking. The word survives as
            the accessible name, where it is genuinely needed and costs the
            canvas nothing. */}
        <svg width="10" height="34" viewBox="0 0 10 34" aria-hidden="true" style={{ opacity: 0.5 }}>
          {[0, 1, 2].map((i) => (
            <rect
              key={i} x={2} y={4 + i * 9} width={6} height={1.6} rx={0.8}
              fill="var(--i-text-faint)"
            />
          ))}
        </svg>
      </div>
    );
  }

  // ── CANDIDATE ─────────────────────────────────────────────────────
  if (candidate) {
    const needsDate = !candidate.date;
    return (
      <div className={PANEL} style={PANEL_STYLE}>
        <div className="px-4 py-3 relative" style={HEAD_STYLE}>
          <div className="i-label">Inspecting · candidate</div>
          <CloseButton onClose={onClose} />
          <div className="mt-1 text-[13px] leading-snug text-[var(--i-text)]">{candidate.title}</div>
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded px-1.5 py-[3px]"
            style={{ background: "var(--i-violet-soft)", border: "1px solid var(--i-violet)" }}>
            <span className="text-[8px] uppercase tracking-[0.14em]" style={{ color: "var(--i-violet)" }}>
              Not timeline reality
            </span>
          </div>
        </div>
        <div className="px-4 pb-4">
          {/* WHAT THE SOURCE PROPOSED — and it is a proposal, which is why
              this section is called Suggested rather than Details. Placing it
              somewhere else does not correct any of this; the source keeps its
              record and Timeline keeps the placement. */}
          <Section title="Suggested">
            <Well>
              <Row label="Project" value={laneName ?? "—"} />
              <Row
                label="Date"
                value={candidate.date ? fmtFull(new Date(candidate.date).getTime()) : "not established"}
                tone={needsDate ? "var(--i-amber)" : undefined}
              />
              {candidate.date && candidate.endDate && (
                <Row
                  label="Runs"
                  value={`${Math.max(1, Math.round((new Date(candidate.endDate).getTime() - new Date(candidate.date).getTime()) / 86400000))} days`}
                />
              )}
              <Row label="Shape" value={candidate.endDate ? "activity" : "moment"} />
              <Row label="Kind" value={candidate.kind} />
            </Well>
          </Section>

          <Section title="Source">
            <Well>
              <Row label="From" value={spokenSourceLabel(candidate.sourceLabel)} />
              <Row
                label="Status"
                value={needsDate ? (suppliedDate ? "Candidate · timing set, not placed" : "Candidate · needs timing") : "Candidate · not on the timeline"}
                tone="var(--i-violet)"
              />
            </Well>
          </Section>

          {candidate.excerpts.length > 0 && (
            <Section title="Evidence">
              {candidate.excerpts.map((x, i) => (
                <Quote key={i}>“{x}”</Quote>
              ))}
            </Section>
          )}

          {needsDate && (
            <Section title="Timing">
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
              {suppliedDate && (
                <p className="text-[10px] leading-relaxed mt-2" style={{ color: "var(--i-violet)" }} data-shoot="timing-set">
                  Timing set to {fmtFull(new Date(suppliedDate).getTime())}. It is not on the timeline yet —
                  drag it from Event Intake onto the project it belongs to.
                </p>
              )}
            </Section>
          )}

          {err && <div className="mt-2 text-[10px]" style={{ color: "var(--i-red)" }}>{err}</div>}

          <div className="mt-4 flex gap-2">
            {/* TWO QUESTIONS, ANSWERED SEPARATELY.
                A placement needs a WHEN and a WHICH PROJECT. For a dateless
                candidate the evidence answers neither, and this button used to
                take a typed date and seat the piece at the source's suggested
                project in the same press — accepting a suggestion on the
                human's behalf, which is exactly the boundary Event Intake
                exists to hold. It now answers only the question it was asked:
                the timing is established, the piece becomes draggable, and
                where it goes is still someone's decision.
                For a candidate the source DID date, the button remains a real
                one-press path — but it is named for what it does, so pressing
                it is visibly a person choosing the suggestion rather than the
                suggestion applying itself. */}
            <button
              data-shoot="accept-candidate"
              disabled={busy || (needsDate && !dateDraft)}
              onClick={async () => {
                setErr(null);
                if (needsDate) {
                  onSupplyTiming(candidate.id, new Date(dateDraft).toISOString());
                  return;
                }
                try {
                  await onAcceptCandidate(candidate.id, null);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Could not place");
                }
              }}
              className="flex-1 rounded-md py-2 text-[11px] font-medium disabled:opacity-35 hover:brightness-110"
              style={{ background: "var(--i-violet)", color: "var(--i-void)" }}
              title={
                needsDate
                  ? "Establish the timing. You still choose which project it belongs to."
                  : "Place it where the source suggested — this project, this date"
              }
            >
              {needsDate ? "Set timing" : "Use suggested placement"}
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

  return (
    <div className={PANEL} style={PANEL_STYLE}>
      <div className="px-4 py-3 relative" style={HEAD_STYLE}>
        <div className="i-label">Inspecting</div>
        <CloseButton onClose={onClose} />
        <div className="mt-1 flex items-start gap-2">
          <span className="mt-[5px] h-[7px] w-[7px] rounded-[1px] shrink-0" style={{ background: color, transform: "rotate(45deg)" }} />
          <div className="text-[13px] leading-snug text-[var(--i-text)]">{e.title}</div>
        </div>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <span className="text-[9px] uppercase tracking-[0.12em]" style={{ color }}>{labelFor(e)}</span>
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
          <Well>
          <Row label={e.endDate ? "Starts" : "Date"} value={fmtFull(new Date(e.date).getTime())} />
          {e.endDate && <Row label="Ends" value={fmtFull(new Date(e.endDate).getTime())} />}
          {/* EXACT, IN NUMBERS. A span dragged by hand landed somewhere
              specific, and the record has to be able to say where without
              anyone measuring pixels. */}
          {e.endDate && (
            <Row
              label="Duration"
              value={`${Math.round(
                (new Date(e.endDate).getTime() - new Date(e.date).getTime()) / 86400000
              )} days`}
            />
          )}
          <Row label="Project" value={laneName ?? "—"} />
          <Row label="State" value={planned ? (overdue ? "planned · overdue" : "planned") : "occurred"} />
          {/* A landmark's own origin has its own section below — printing it
              here as well said "hermes · Aug 12 refinement call" twice in one
              panel. Everything else on the score keeps it, because nothing
              else has an Origin section to put it in. */}
          {e.sourceLabel && e.family !== "landmark" && <Row label="Source" value={spokenSourceLabel(e.sourceLabel)} />}
          </Well>
          {e.editable && (
            <p className="mt-1.5 text-[9px] text-[var(--i-text-faint)]" data-shoot="plan-ownership">
              {planned
                ? "Timeline owns this timing — drag it on the score, or edit it here."
                : "This one has happened. It can be edited here, but it does not move by dragging."}
            </p>
          )}
        </Section>

        {e.kind === "report" && (
          <ReportBody snap={detail as unknown as ForecastSnapshot} onOpenForecast={() => onOpenForecast(e.scopeId)} />
        )}

        {e.family === "decision" && (
          <>
            <Section title="Decision">
              <Well>
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
              </Well>
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
                  <Quote key={i} label={ev.sourceLabel}>“{ev.excerpt}”</Quote>
                ))}
              </Section>
            )}
            <Door onClick={() => onOpenDecisions(String(detail.decisionId))} shoot="open-decisions" color="#e0b04a">
              Open Decisions
            </Door>
          </>
        )}

        {e.kind === "context_observed" && (
          <>
            <Section title="Observation">
              <Well>
              <Row label="Source type" value={String(detail.sourceType ?? "—")} />
              <Row label="Producer" value={String(detail.producer ?? "—")} />
              <Row label="Observed at" value={fmtFull(new Date(String(detail.observedAt)).getTime())} />
              {typeof detail.detailNote === "string" && detail.detailNote && <Row label="Detail" value={detail.detailNote} />}
              </Well>
            </Section>
            {Array.isArray(detail.excerpts) && (detail.excerpts as string[]).length > 0 && (
              <Section title="Evidence">
                {(detail.excerpts as string[]).map((x, i) => (
                  <Quote key={i}>“{x}”</Quote>
                ))}
              </Section>
            )}
          </>
        )}

        {e.kind === "work_completed" && (
          <>
            <Section title="Work">
              <Well>
              <Row label="Identifier" value={String(detail.identifier ?? "—")} />
              <Row label="Completed" value={fmtFull(new Date(String(detail.completedAt)).getTime())} />
              </Well>
            </Section>
            <p className="mt-3 text-[10px] leading-relaxed text-[var(--i-text-faint)]">
              {String(detail.limitation ?? "")}
            </p>
          </>
        )}

        {e.kind === "landmark" && (
          <>
            <Section title="Landmark">
              <Well>
              {/* "Added by" said the same thing the Placement section now
                  says, in worse words. Kind is what a Landmark section is
                  actually for. */}
              <Row label="Kind" value={String(detail.landmarkKind ?? "event")} />
              {typeof detail.note === "string" && detail.note && <Row label="Note" value={detail.note} />}
              </Well>
            </Section>
            {/* TWO DIFFERENT FACTS, TWO DIFFERENT SECTIONS.
                ORIGIN is where the claim came from — a system, a transcript,
                the evidence it cited. That is provenance, and it belongs to
                the claim for as long as the claim exists.
                PLACEMENT is how this Timeline object came to be on the
                Timeline. "Placed from Event Intake" is not provenance; it is a
                fact about this instrument's own history, and filing it under
                Origin made the panel look like it was attributing the date to
                Hermes. They are kept apart. */}
            {String(detail.source) === "candidate" && typeof detail.sourceLabel === "string" && (
              <Section title="Origin">
                <Well>
                  <Row label="From" value={spokenSourceLabel(detail.sourceLabel)} tone="var(--i-violet)" />
                  {Array.isArray(detail.evidenceRefs) && detail.evidenceRefs.length > 0 && (
                    <Row label="Evidence" value={`${detail.evidenceRefs.length} cited`} />
                  )}
                </Well>
              </Section>
            )}
            <Section title="Placement">
              <Well>
                <Row
                  label="Seated"
                  value={String(detail.source) === "candidate" ? "from Event Intake" : "by hand"}
                />
              </Well>
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
