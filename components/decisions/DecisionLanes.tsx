"use client";

// THE FOUR LANES BENEATH THE CIRCUIT.
//
// Each lane is a different material because each is a different KIND of
// truth, not a different priority:
//
//   CANDIDATES  violet, unseated  — a machine's suggestion. Not Reality.
//   OPEN        amber, seated     — a real unresolved choice. No forecast effect.
//   DECIDED     mint, settled     — institutional memory. Never deleted.
//   DISMISSED   graphite, collapsed — not a decision. Takes no space.
//
// None of them connect to the delivery path above. That absence is the
// point: only a gate is drawn touching the circuit.

import { LANE_COLOR, shortId, type CandidateRow, type DecisionRow } from "@/lib/decisions/model";
import { fmtDay } from "@/lib/instrument/useProject";

function LaneHead({
  tone,
  title,
  sub,
  count,
  glyph,
}: {
  tone: string;
  title: string;
  sub: string;
  count: number;
  glyph: React.ReactNode;
}) {
  return (
    <div className="shrink-0 flex items-start gap-2.5 pr-4" style={{ width: 210 }}>
      <div
        className="i-meter grid place-items-center rounded-lg"
        style={{ width: 34, height: 34, color: tone }}
        aria-hidden
      >
        {glyph}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: tone }}>
          {title}
        </div>
        <div className="mt-0.5 text-[10px] leading-tight text-[var(--i-text-faint)]">{sub}</div>
        <div className="mt-1 text-[13px] i-readout" style={{ color: "var(--i-text-soft)" }}>
          {count}
        </div>
      </div>
    </div>
  );
}

function LaneShell({
  shoot,
  tone,
  wash,
  children,
}: {
  shoot: string;
  tone: string;
  wash: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-shoot={shoot}
      className="flex items-stretch rounded-lg px-3 py-3"
      style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)", borderLeft: `2px solid ${tone}`, backgroundImage: `linear-gradient(90deg, ${wash}, transparent 22%)` }}
    >
      {children}
    </div>
  );
}

// ── CANDIDATES ─────────────────────────────────────────────────────────
// Deliberately lifted off the surface and dashed: it has not been seated
// into Reality, and it must not read as though it had been.
export function CandidateTray({
  candidates,
  selectedId,
  onSelect,
}: {
  candidates: CandidateRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <LaneShell shoot="lane-candidates" tone={LANE_COLOR.candidate} wash="rgba(155,140,250,0.07)">
      <LaneHead
        tone={LANE_COLOR.candidate}
        title="Candidates"
        sub="Machine-suggested. Not yet accepted."
        count={candidates.length}
        glyph={<Sparkle />}
      />
      {candidates.length === 0 ? (
        <EmptyNote shoot="candidates-empty">No new candidate decisions.</EmptyNote>
      ) : (
        <div className="flex-1 min-w-0 flex gap-2.5 overflow-x-auto pb-1">
          {candidates.map((c) => (
            <button
              key={c.id}
              data-shoot={`candidate-${c.id}`}
              onClick={() => onSelect(c.id)}
              className="shrink-0 text-left rounded-lg px-3 py-2.5 transition-all duration-200 hover:-translate-y-[1px]"
              style={{
                width: 236,
                background: "var(--i-panel-raised)",
                border: `1px dashed ${selectedId === c.id ? "var(--i-violet)" : "rgba(155,140,250,0.45)"}`,
                boxShadow: "0 6px 12px rgba(0,0,0,0.45)",
              }}
            >
              <div className="flex items-center gap-2">
                <span className="i-label">{shortId("C", c.id)}</span>
                <span
                  className="ml-auto h-1.5 w-1.5 rounded-full"
                  style={{ background: LANE_COLOR.candidate }}
                  aria-hidden
                />
              </div>
              <div className="mt-1 text-[12.5px] font-semibold text-[var(--i-text)] leading-tight line-clamp-2">
                {c.title}
              </div>
              {c.question && (
                <div className="mt-0.5 text-[11px] text-[var(--i-text-faint)] line-clamp-1">{c.question}</div>
              )}
              <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--i-text-faint)]">
                <span className="truncate">From: {c.sourceLabel}</span>
                <span className="ml-auto shrink-0">{c.excerpts.length} evidence</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </LaneShell>
  );
}

// ── OPEN ───────────────────────────────────────────────────────────────
export function OpenLane({
  decisions,
  selectedId,
  onSelect,
}: {
  decisions: DecisionRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <LaneShell shoot="lane-open" tone={LANE_COLOR.open} wash="rgba(224,176,74,0.07)">
      <LaneHead
        tone={LANE_COLOR.open}
        title="Open"
        sub="Accepted decisions. Not resolved. No forecast effect."
        count={decisions.length}
        glyph={<Clock />}
      />
      {decisions.length === 0 ? (
        <EmptyNote shoot="open-empty">Nothing unresolved here.</EmptyNote>
      ) : (
        <div className="flex-1 min-w-0 flex gap-2.5 overflow-x-auto pb-1">
          {decisions.map((d) => (
            <button
              key={d.id}
              data-shoot={`open-${d.id}`}
              onClick={() => onSelect(d.id)}
              className="i-control shrink-0 text-left px-3 py-2.5 transition-transform duration-200 hover:-translate-y-[1px]"
              style={{
                width: 248,
                borderColor: selectedId === d.id ? "var(--i-violet)" : "rgba(224,176,74,0.4)",
              }}
            >
              <div className="flex items-center gap-2">
                <span className="i-label">{shortId("D", d.id)}</span>
                <Clock className="ml-auto" color={LANE_COLOR.open} />
              </div>
              <div className="mt-1 text-[12.5px] font-semibold text-[var(--i-text)] leading-tight line-clamp-2">
                {d.title}
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--i-text-faint)] line-clamp-1">
                {d.rationale ?? d.scope.name}
              </div>
              <div className="mt-2 flex items-center gap-2.5 text-[10px] text-[var(--i-text-faint)]">
                {d.owner && <span className="truncate max-w-[92px]">{d.owner}</span>}
                <span>{d.evidence.length} ev</span>
                {d.options.length > 0 && <span>{d.options.length} opt</span>}
                {d.neededBy && (
                  <span className="ml-auto shrink-0" style={{ color: LANE_COLOR.open }}>
                    {fmtDay(new Date(d.neededBy))}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </LaneShell>
  );
}

// ── DECIDED ────────────────────────────────────────────────────────────
export function DecidedBand({
  decisions,
  selectedId,
  onSelect,
}: {
  decisions: DecisionRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <LaneShell shoot="lane-decided" tone={LANE_COLOR.decided} wash="rgba(74,217,168,0.06)">
      <LaneHead
        tone={LANE_COLOR.decided}
        title="Decided"
        sub="Resolved choices. Kept as memory."
        count={decisions.length}
        glyph={<Check />}
      />
      {decisions.length === 0 ? (
        <EmptyNote shoot="decided-empty">No decisions have been settled yet.</EmptyNote>
      ) : (
        <div className="flex-1 min-w-0 flex gap-2.5 overflow-x-auto pb-1">
          {decisions.map((d) => (
            <button
              key={d.id}
              data-shoot={`decided-${d.id}`}
              onClick={() => onSelect(d.id)}
              className="shrink-0 text-left rounded-lg px-3 py-2.5"
              style={{
                width: 248,
                background: "var(--i-recess)",
                border: `1px solid ${selectedId === d.id ? "var(--i-violet)" : "rgba(74,217,168,0.28)"}`,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="i-label">{shortId("D", d.id)}</span>
                <span
                  className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]"
                  style={{ background: "var(--i-mint-soft)", color: LANE_COLOR.decided }}
                >
                  Decided
                </span>
              </div>
              <div className="mt-1 text-[12.5px] font-semibold text-[var(--i-text-soft)] leading-tight line-clamp-2">
                {d.title}
              </div>
              {(d.chosenOption || d.resolution) && (
                <div className="mt-0.5 text-[11px] line-clamp-1" style={{ color: LANE_COLOR.decided }}>
                  {d.chosenOption ?? d.resolution}
                </div>
              )}
              <div className="mt-2 flex items-center gap-2.5 text-[10px] text-[var(--i-text-faint)]">
                {d.decidedAt && <span>Decided {fmtDay(new Date(d.decidedAt))}</span>}
                <span className="ml-auto">{d.evidence.length} ev</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </LaneShell>
  );
}

// ── DISMISSED ──────────────────────────────────────────────────────────
// One line. A dismissed decision is not a decision, and giving it a lane
// would be giving it standing it does not have.
export function DismissedBar({
  decisions,
  expanded,
  onToggle,
  selectedId,
  onSelect,
}: {
  decisions: DecisionRow[];
  expanded: boolean;
  onToggle: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      data-shoot="lane-dismissed"
      className="rounded-lg px-3 py-2"
      style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)", borderLeft: "2px solid var(--i-reality)" }}
    >
      <button onClick={onToggle} className="flex w-full items-center gap-2.5 text-left" disabled={decisions.length === 0}>
        <span className="i-label" style={{ color: "var(--i-text-soft)" }}>
          Dismissed
        </span>
        <span className="text-[10px] text-[var(--i-text-faint)]">
          Not a real decision · no longer relevant · never in the forecast
        </span>
        <span className="ml-auto text-[12px] i-readout text-[var(--i-text-soft)]">{decisions.length}</span>
        {decisions.length > 0 && (
          <span className="text-[10px] text-[var(--i-text-faint)]">{expanded ? "hide" : "show"}</span>
        )}
      </button>
      {expanded && decisions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {decisions.map((d) => (
            <button
              key={d.id}
              data-shoot={`dismissed-${d.id}`}
              onClick={() => onSelect(d.id)}
              className="rounded px-2 py-1 text-[11px] text-[var(--i-text-faint)]"
              style={{
                border: `1px solid ${selectedId === d.id ? "var(--i-violet)" : "var(--i-border)"}`,
              }}
            >
              {d.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyNote({ shoot, children }: { shoot: string; children: React.ReactNode }) {
  return (
    <div
      data-shoot={shoot}
      className="flex-1 flex items-center px-3 text-[11px] text-[var(--i-text-faint)]"
      style={{ minHeight: 74 }}
    >
      {children}
    </div>
  );
}

function Sparkle() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M7.4 2.6 8.9 6.3l3.7 1.5-3.7 1.5-1.5 3.7-1.5-3.7L2 8.1l3.9-1.5z" fill="currentColor" />
      <circle cx="12.4" cy="3.6" r="1.15" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
function Clock({ className, color }: { className?: string; color?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth="1.3"
    >
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 5v3.2l2 1.3" strokeLinecap="round" />
    </svg>
  );
}
function Check() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="5.8" opacity="0.5" />
      <path d="m5.4 8.2 1.9 1.9 3.4-3.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
