"use client";

// THE MODULE BAYS BENEATH THE CIRCUIT.
//
// Three bays cut into the same chassis as the circuit, each holding the
// same physical decision module in a different seating:
//
//   CANDIDATE BAY    violet, unseated  — the machine's intake. Not Reality.
//   OPEN BANK        amber, seated     — real unresolved choices, no gate.
//   DECISION MEMORY  mint, latched     — settled, kept.
//   DISMISSED        graphite, one line — not a decision, takes no space.
//
// Not one of them touches the conductor above. That absence is the product
// lesson: a real decision is not a delivery gate, and the geometry says so
// before any label is read.
//
// The bays share the circuit's chassis width so the page reads as one
// machine face rather than three ragged panels. Empty space inside a bay
// is empty RACK space -- shallow, obviously unfilled, and nothing like a
// dashboard panel padded out to fill a viewport.

import DecisionModule from "@/components/decisions/DecisionModule";
import { LANE_COLOR, shortId, type CandidateRow, type DecisionRow } from "@/lib/decisions/model";
import { fmtDay } from "@/lib/instrument/useProject";

const MODULE_W = 226;

function Bay({
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
      className="dc-bay flex w-full items-stretch py-2.5 pl-3 pr-3"
    >
      {/* The bay's nameplate: engraved into the chassis, not a card header.
          The score to its right is the cut between nameplate and rail. */}
      <div className="dc-score mr-3 flex shrink-0 items-center gap-2.5 pr-3" style={{ width: 194 }}>
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
          style={{
            color: tone,
            background: "#070a0c",
            boxShadow: `inset 0 2px 5px rgba(0,0,0,0.8), 0 0 0 1px ${tone}33`,
          }}
          aria-hidden
        >
          {glyph}
        </span>
        <span className="min-w-0">
          <span
            className="block whitespace-nowrap text-[9.5px] font-bold uppercase tracking-[0.14em]"
            style={{ color: tone }}
          >
            {title}
          </span>
          <span className="mt-[3px] block text-[9px] leading-tight text-[var(--i-text-faint)]">{sub}</span>
        </span>
        <span
          className="ml-auto i-readout shrink-0 text-[15px]"
          style={{ color: count > 0 ? tone : "var(--i-text-faint)" }}
        >
          {count}
        </span>
      </div>

      {/* THE RAIL. It runs to the chassis edge whether or not anything is
          standing on it, so a half-filled bay reads as a rack with room --
          which is true -- instead of as a card with slack padding. */}
      <div className="dc-rail relative min-w-0 flex-1 px-[5px] py-[5px]">
        {count === 0 ? (
          <div
            data-shoot={emptyShoot}
            className="flex items-center pl-1 text-[10px] text-[var(--i-text-faint)]"
            style={{ minHeight: 78 }}
          >
            {empty}
          </div>
        ) : (
          <div className="flex min-w-0 items-start gap-2 overflow-x-auto">{children}</div>
        )}
      </div>
    </div>
  );
}

// ── CANDIDATE BAY ──────────────────────────────────────────────────────
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
    <Bay
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
        <DecisionModule
          key={c.id}
          flipId={c.id}
          shoot={`candidate-${c.id}`}
          seating="unseated"
          accent={LANE_COLOR.candidate}
          chip="Candidate"
          ident={shortId("C", c.id)}
          title={c.title}
          sub={c.question}
          width={MODULE_W}
          selected={selectedId === c.id}
          onClick={() => onSelect(c.id)}
          meta={[{ label: c.sourceLabel }, { label: `${c.excerpts.length} ev` }]}
        />
      ))}
    </Bay>
  );
}

// ── OPEN BANK ──────────────────────────────────────────────────────────
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
    <Bay
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
        <DecisionModule
          key={d.id}
          flipId={d.id}
          shoot={`open-${d.id}`}
          seating="banked"
          accent={LANE_COLOR.open}
          chip="Open"
          ident={shortId("D", d.id)}
          title={d.title}
          sub={d.rationale}
          width={MODULE_W}
          selected={selectedId === d.id}
          onClick={() => onSelect(d.id)}
          meta={[
            { label: d.owner ?? d.scope.name },
            { label: `${d.evidence.length} ev` },
            ...(d.neededBy ? [{ label: fmtDay(new Date(d.neededBy)), tone: LANE_COLOR.open }] : []),
          ]}
        />
      ))}
    </Bay>
  );
}

// ── DECISION MEMORY ────────────────────────────────────────────────────
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
    <Bay
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
        <DecisionModule
          key={d.id}
          flipId={d.id}
          shoot={`decided-${d.id}`}
          seating="latched"
          accent={LANE_COLOR.decided}
          chip="Decided"
          ident={shortId("D", d.id)}
          title={d.title}
          sub={d.chosenOption ?? d.resolution}
          width={MODULE_W}
          selected={selectedId === d.id}
          onClick={() => onSelect(d.id)}
          meta={[
            { label: d.decidedAt ? fmtDay(new Date(d.decidedAt)) : "settled" },
            { label: `${d.evidence.length} ev` },
          ]}
        />
      ))}
    </Bay>
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
      className="w-full rounded-md px-3 py-1.5"
      style={{
        background: "#0b0e11",
        border: "1px solid #161c21",
        boxShadow: "inset 0 1px 4px rgba(0,0,0,0.6)",
      }}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 text-left"
        disabled={decisions.length === 0}
      >
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--i-text-faint)]">
          Dismissed
        </span>
        <span className="text-[9px] text-[var(--i-text-faint)]">not a decision · never in the forecast</span>
        <span className="ml-auto i-readout text-[12px] text-[var(--i-text-faint)]">{decisions.length}</span>
        {decisions.length > 0 && (
          <span className="text-[9px] text-[var(--i-text-faint)]">{expanded ? "hide" : "show"}</span>
        )}
      </button>
      {expanded && decisions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 pb-1">
          {decisions.map((d) => (
            <button
              key={d.id}
              data-shoot={`dismissed-${d.id}`}
              onClick={() => onSelect(d.id)}
              className="rounded px-2 py-1 text-[10px] text-[var(--i-text-faint)]"
              style={{ border: `1px solid ${selectedId === d.id ? "var(--i-violet)" : "#1c2227"}` }}
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
function Clock() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
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
