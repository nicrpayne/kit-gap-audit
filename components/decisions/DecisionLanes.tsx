"use client";

// THE BANKS BENEATH THE CIRCUIT.
//
// Three trays in one chassis, each a different KIND of truth rather than a
// different priority:
//
//   CANDIDATE BAY    violet, spectral   — the machine's intake. Not Reality.
//   OPEN BANK        amber, seated      — real unresolved choices, no gate.
//   DECISION MEMORY  mint, latched      — settled, kept.
//   DISMISSED        graphite, one line — not a decision, takes no space.
//
// Not one of them touches the conductor above. That absence is the product
// lesson: a real decision is not a delivery gate, and the geometry says so
// before any label is read.
//
// Banks size to their contents. A single open decision gets a tray the
// width of one module, not a 1100px empty panel -- dead chassis space is
// composition, not something to fill.

import { LANE_COLOR, shortId, type CandidateRow, type DecisionRow } from "@/lib/decisions/model";
import { fmtDay } from "@/lib/instrument/useProject";

function Bank({
  shoot,
  emptyShoot,
  tone,
  title,
  sub,
  count,
  glyph,
  empty,
  children,
}: {
  shoot: string;
  /** Addressed separately so a proof can assert the quiet empty state
      exists rather than inferring it from the absence of modules. */
  emptyShoot: string;
  tone: string;
  title: string;
  sub: string;
  count: number;
  glyph: React.ReactNode;
  empty: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-shoot={shoot}
      className="flex max-w-full items-stretch gap-3 self-start rounded-lg py-2.5 pl-2.5 pr-3"
      style={{
        width: "fit-content",
        background: "var(--i-panel)",
        border: "1px solid var(--i-border)",
        borderLeftColor: tone,
        borderLeftWidth: 2,
      }}
    >
      <div className="flex shrink-0 items-center gap-2.5" style={{ width: 186 }}>
        <span className="i-meter grid h-8 w-8 shrink-0 place-items-center rounded-md" style={{ color: tone }} aria-hidden>
          {glyph}
        </span>
        <span className="min-w-0">
          <span
            className="block whitespace-nowrap text-[9.5px] font-bold uppercase tracking-[0.13em]"
            style={{ color: tone }}
          >
            {title}
          </span>
          <span className="mt-[3px] block text-[9.5px] leading-tight text-[var(--i-text-faint)]">{sub}</span>
        </span>
        <span className="ml-auto i-readout shrink-0 text-[15px]" style={{ color: count > 0 ? tone : "var(--i-text-faint)" }}>
          {count}
        </span>
      </div>

      {count === 0 ? (
        <div data-shoot={emptyShoot} className="flex items-center pl-1 text-[10.5px] text-[var(--i-text-faint)]">
          {empty}
        </div>
      ) : (
        <div className="flex min-w-0 gap-2 overflow-x-auto">{children}</div>
      )}
    </div>
  );
}

// ── CANDIDATE BAY ──────────────────────────────────────────────────────
// Lifted off the chassis and dashed on every edge: this module has not
// been seated into Reality, and must not read as though it had been.
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
    <Bank
      shoot="lane-candidates"
      emptyShoot="candidates-empty"
      tone={LANE_COLOR.candidate}
      title="Candidate bay"
      sub="Machine-suggested · unaccepted"
      count={candidates.length}
      glyph={<Sparkle />}
      empty="No new candidate decisions."
    >
      {candidates.map((c) => (
        <button
          key={c.id}
          data-shoot={`candidate-${c.id}`}
          onClick={() => onSelect(c.id)}
          className="shrink-0 rounded-md px-2.5 py-2 text-left transition-transform duration-200 hover:-translate-y-[2px]"
          style={{
            width: 218,
            background: "var(--i-panel-raised)",
            border: `1px dashed ${selectedId === c.id ? "var(--i-violet)" : "rgba(155,140,250,0.5)"}`,
            boxShadow: "0 7px 14px rgba(0,0,0,0.5)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="i-label">{shortId("C", c.id)}</span>
            <span
              aria-hidden
              className="ml-auto h-1.5 w-1.5 rounded-full"
              style={{ background: LANE_COLOR.candidate, boxShadow: "0 0 6px rgba(155,140,250,0.7)" }}
            />
          </div>
          <div className="mt-1 text-[12px] font-semibold leading-[1.25] text-[var(--i-text)] line-clamp-2">
            {c.title}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[9.5px] text-[var(--i-text-faint)]">
            <span className="truncate">{c.sourceLabel}</span>
            <span className="ml-auto shrink-0">{c.excerpts.length} ev</span>
          </div>
        </button>
      ))}
    </Bank>
  );
}

// ── OPEN BANK ──────────────────────────────────────────────────────────
// Seated, solid, amber — and connected to nothing.
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
    <Bank
      shoot="lane-open"
      emptyShoot="open-empty"
      tone={LANE_COLOR.open}
      title="Open bank"
      sub="Accepted · unresolved · no gate"
      count={decisions.length}
      glyph={<Clock />}
      empty="Nothing unresolved here."
    >
      {decisions.map((d) => (
        <button
          key={d.id}
          data-shoot={`open-${d.id}`}
          onClick={() => onSelect(d.id)}
          className="i-control shrink-0 px-2.5 py-2 text-left transition-transform duration-200 hover:-translate-y-[1px]"
          style={{
            width: 228,
            borderColor: selectedId === d.id ? "var(--i-violet)" : "rgba(224,176,74,0.42)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="i-label">{shortId("D", d.id)}</span>
            <Clock className="ml-auto" color={LANE_COLOR.open} />
          </div>
          <div className="mt-1 text-[12px] font-semibold leading-[1.25] text-[var(--i-text)] line-clamp-2">
            {d.title}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[9.5px] text-[var(--i-text-faint)]">
            <span className="truncate">{d.owner ?? d.scope.name}</span>
            <span>{d.evidence.length} ev</span>
            {d.neededBy && (
              <span className="ml-auto shrink-0" style={{ color: LANE_COLOR.open }}>
                {fmtDay(new Date(d.neededBy))}
              </span>
            )}
          </div>
        </button>
      ))}
    </Bank>
  );
}

// ── DECISION MEMORY ────────────────────────────────────────────────────
// Latched: recessed rather than raised, because there is nothing left to
// operate. Quieter than active uncertainty, and never deleted.
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
    <Bank
      shoot="lane-decided"
      emptyShoot="decided-empty"
      tone={LANE_COLOR.decided}
      title="Decision memory"
      sub="Settled · kept as history"
      count={decisions.length}
      glyph={<Check />}
      empty="No decisions have been settled yet."
    >
      {decisions.map((d) => (
        <button
          key={d.id}
          data-shoot={`decided-${d.id}`}
          onClick={() => onSelect(d.id)}
          className="shrink-0 rounded-md px-2.5 py-2 text-left"
          style={{
            width: 218,
            background: "var(--i-recess)",
            border: `1px solid ${selectedId === d.id ? "var(--i-violet)" : "rgba(74,217,168,0.24)"}`,
            boxShadow: "0 2px 6px rgba(0,0,0,0.5) inset",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="i-label">{shortId("D", d.id)}</span>
            <span
              aria-hidden
              className="ml-auto h-1.5 w-1.5 rounded-full"
              style={{ background: LANE_COLOR.decided }}
            />
          </div>
          <div className="mt-1 text-[12px] font-medium leading-[1.25] text-[var(--i-text-soft)] line-clamp-2">
            {d.title}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[9.5px]">
            <span className="truncate" style={{ color: LANE_COLOR.decided }}>
              {d.chosenOption ?? d.resolution ?? "settled"}
            </span>
            {d.decidedAt && (
              <span className="ml-auto shrink-0 text-[var(--i-text-faint)]">{fmtDay(new Date(d.decidedAt))}</span>
            )}
          </div>
        </button>
      ))}
    </Bank>
  );
}

// ── DISMISSED ──────────────────────────────────────────────────────────
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
      className="max-w-full self-start rounded-md px-3 py-1.5"
      style={{
        width: "fit-content",
        minWidth: 360,
        background: "var(--i-panel)",
        border: "1px solid var(--i-border)",
        borderLeft: "2px solid var(--i-reality)",
      }}
    >
      <button onClick={onToggle} className="flex w-full items-center gap-2.5 text-left" disabled={decisions.length === 0}>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-[var(--i-text-faint)]">
          Dismissed
        </span>
        <span className="text-[9.5px] text-[var(--i-text-faint)]">not a decision · never in the forecast</span>
        <span className="ml-auto i-readout text-[12px] text-[var(--i-text-faint)]">{decisions.length}</span>
        {decisions.length > 0 && (
          <span className="text-[9.5px] text-[var(--i-text-faint)]">{expanded ? "hide" : "show"}</span>
        )}
      </button>
      {expanded && decisions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 pb-1">
          {decisions.map((d) => (
            <button
              key={d.id}
              data-shoot={`dismissed-${d.id}`}
              onClick={() => onSelect(d.id)}
              className="rounded px-2 py-1 text-[10.5px] text-[var(--i-text-faint)]"
              style={{ border: `1px solid ${selectedId === d.id ? "var(--i-violet)" : "var(--i-border)"}` }}
            >
              {d.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sparkle() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M7.4 2.6 8.9 6.3l3.7 1.5-3.7 1.5-1.5 3.7-1.5-3.7L2 8.1l3.9-1.5z" fill="currentColor" />
      <circle cx="12.4" cy="3.6" r="1.15" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
function Clock({ className, color }: { className?: string; color?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
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
