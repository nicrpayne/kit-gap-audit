"use client";

// THE DECISION CIRCUIT — one serial conductor, running left to right, with
// gates seated INTO it.
//
// The first version drew a continuous line with gate cards hanging beneath
// it on a bus. That was the wrong picture: it said "these decisions are
// related to delivery" when the engine says something much stronger --
// sampleOwnDays adds each gate's duration IN SERIES, so a live gate is a
// point delivery genuinely cannot pass. So the conductor now STOPS at a
// live gate's contact pads and does not cross it. The break is the fact.
//
// Assuming a gate decided lifts the module out of its socket and closes a
// conductor underneath it; the empty socket stays visible as a dashed
// ghost, because Reality still holds that decision open.
//
// Every node is a real delivery landmark: the project, its actual
// targetDate, its simulated landing, and the scopes that genuinely list it
// in dependsOnScopeIds. There is no Release model in this app and the
// circuit does not draw one.

import { shortId, type DecisionRow } from "@/lib/decisions/model";
import { fmtDay } from "@/lib/instrument/useProject";

export interface CircuitNode {
  id: string;
  name: string;
  likely: Date | null;
  targetDate: Date | null;
  gateCount: number;
}

// One geometry, shared by the row and the conductor, so a segment can never
// end somewhere a module does not begin.
const TERMINAL_W = 118;
const SEG_W = 46;
const GATE_W = 262;
const LANDMARK_W = 238;
const DOWNSTREAM_W = 186;
const ROW_H = 238;

// The conductor runs LOW in the row, and a seated module's lower lip is
// plugged into it. That one decision is what makes the released state
// readable: withdrawing the module upward uncovers the socket instead of
// hiding the closed conductor behind the card that just left it.
//
// MODULE_TOP therefore reserves exactly LIFT of headroom above a seated
// module, so a withdrawn one has somewhere to go instead of being clipped
// by the top of the circuit.
const LINE_Y = 174; // conductor centre line, from the top of the row
const MODULE_TOP = 44;
const MODULE_H = 142; // bottom lip sits 12px past the line
const LIFT = 40; // enough to clear the line with daylight beneath

export default function DecisionCircuit({
  startDate,
  origin,
  downstream,
  gates,
  assumedGateIds,
  selectedId,
  onSelect,
  onAssume,
}: {
  startDate: Date | null;
  origin: CircuitNode;
  downstream: CircuitNode[];
  /** Open, serially gating decisions whose gate targets the origin node,
      in a DETERMINISTIC PRESENTATION ORDER (oldest recorded first). The
      engine sums gate durations and claims no causal ordering between
      them, so neither does this. */
  gates: DecisionRow[];
  assumedGateIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAssume: (gateId: string, assume: boolean) => void;
}) {
  const live = gates.filter((d) => d.gate && !assumedGateIds.has(d.gate.id));
  const constrained = live.length > 0;

  return (
    <div data-shoot="decision-circuit" className="px-6 pt-4">
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--i-text)]">
          Decision Circuit
        </span>
        <span className="text-[11px] text-[var(--i-text-faint)]">
          What&apos;s unresolved, what&apos;s gating, what moves delivery.
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full transition-colors duration-500"
            style={{ background: constrained ? "var(--i-red)" : "var(--i-mint)" }}
          />
          <span
            data-shoot={constrained ? "circuit-state" : "circuit-clear"}
            className="text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors duration-500"
            style={{ color: constrained ? "var(--i-red)" : "var(--i-mint)" }}
          >
            {constrained
              ? `${live.length} constraint${live.length === 1 ? "" : "s"} in path`
              : "Delivery path open"}
          </span>
        </span>
      </div>

      {/* The conductor. Scrolls within itself rather than pushing the page
          sideways when a project carries many gates. */}
      <div className="mt-0.5 overflow-x-auto pb-1">
        <div className="flex items-center" style={{ height: ROW_H, minWidth: "min-content" }}>
          <Terminal label="Now" value={startDate ? fmtDay(startDate) : "—"} />

          {gates.length === 0 ? (
            <Conductor lit />
          ) : (
            gates.map((d) => {
              const released = !!d.gate && assumedGateIds.has(d.gate.id);
              return (
                <div key={d.id} className="flex items-center">
                  <Conductor lit={released} broken={!released} />
                  <GateSocket
                    decision={d}
                    released={released}
                    selected={selectedId === d.id}
                    onSelect={() => onSelect(d.id)}
                    onAssume={(assume) => d.gate && onAssume(d.gate.id, assume)}
                  />
                </div>
              );
            })
          )}

          <Conductor lit={!constrained} broken={constrained} />
          <Landmark node={origin} constrained={constrained} />

          {downstream.map((n) => (
            <div key={n.id} className="flex items-center">
              <Conductor lit={!constrained} broken={constrained} dim />
              <Downstream node={n} />
            </div>
          ))}
        </div>
      </div>

      {gates.length > 1 && (
        <p className="mt-1 text-[10px] text-[var(--i-text-faint)]">
          Shown oldest first. The engine adds these in series but knows of no order between them — this is
          presentation order, not a claim about which must be settled first.
        </p>
      )}
    </div>
  );
}

// ── CONDUCTOR ──────────────────────────────────────────────────────────
// Lit: delivery flows. Broken: it does not, and the segment stops in a
// contact pad rather than fading out — an interruption, not a style.
function Conductor({ lit, broken, dim }: { lit?: boolean; broken?: boolean; dim?: boolean }) {
  return (
    <div className="relative shrink-0" style={{ width: SEG_W, height: ROW_H }}>
      <div
        aria-hidden
        className="absolute left-0 right-0 transition-all duration-500"
        style={{
          top: LINE_Y - 1,
          height: 2,
          opacity: dim ? 0.45 : 1,
          background: broken
            ? "repeating-linear-gradient(90deg, rgba(239,107,91,0.55) 0 3px, transparent 3px 7px)"
            : lit
              ? "var(--i-mint)"
              : "var(--i-border-strong)",
          boxShadow: lit && !broken ? "0 0 8px rgba(74,217,168,0.45)" : undefined,
        }}
      />
    </div>
  );
}

function Terminal({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative shrink-0" style={{ width: TERMINAL_W, height: ROW_H }}>
      <div
        className="i-meter absolute left-0 right-0 flex flex-col justify-center px-3.5"
        style={{ top: LINE_Y - 38, height: 76 }}
      >
        <div className="i-label">{label}</div>
        <div className="mt-1 i-readout text-[14px] text-[var(--i-text-soft)]">{value}</div>
      </div>
    </div>
  );
}

// ── THE SOCKET AND WHAT SITS IN IT ─────────────────────────────────────
function GateSocket({
  decision,
  released,
  selected,
  onSelect,
  onAssume,
}: {
  decision: DecisionRow;
  released: boolean;
  selected: boolean;
  onSelect: () => void;
  onAssume: (assume: boolean) => void;
}) {
  const gate = decision.gate!;
  const accent = released ? "var(--i-violet)" : "var(--i-red)";

  return (
    <div className="relative shrink-0" style={{ width: GATE_W, height: ROW_H }}>
      {/* THE SOCKET. A recessed well cut into the conductor line. While the
          module is seated its lower lip fills this and the conductor stops
          dead at the pads either side; once withdrawn, the well is empty
          and a closed conductor runs straight through it. */}
      <div
        aria-hidden
        className="absolute left-0 right-0 rounded transition-all duration-500"
        style={{
          top: LINE_Y - 15,
          height: 30,
          background: "var(--i-recess)",
          border: `1px dashed ${released ? "var(--i-border-strong)" : "transparent"}`,
          boxShadow: "inset 0 2px 6px rgba(0,0,0,0.6)",
          opacity: released ? 1 : 0.55,
        }}
      />
      <div
        aria-hidden
        className="absolute left-0 right-0 transition-all duration-500"
        style={{
          top: LINE_Y - 1,
          height: 2,
          background: released ? "var(--i-mint)" : "transparent",
          boxShadow: released ? "0 0 9px rgba(74,217,168,0.5)" : undefined,
        }}
      />

      <button
        data-shoot={`gate-${gate.id}`}
        data-assumed={released ? "true" : "false"}
        onClick={onSelect}
        className="i-control absolute left-0 right-0 text-left transition-all duration-500"
        style={{
          top: MODULE_TOP,
          height: MODULE_H,
          transform: released ? `translateY(-${LIFT}px)` : "translateY(0)",
          opacity: released ? 0.6 : 1,
          borderColor: selected ? "var(--i-violet)" : accent,
          boxShadow: released
            ? "0 18px 26px rgba(0,0,0,0.6)"
            : "0 0 0 1px rgba(239,107,91,0.18), 0 2px 6px rgba(0,0,0,0.5)",
        }}
      >
        {/* Contact pads on the module's lower lip — the point the
            conductor actually meets, and the point it separates from. */}
        <Pad side="left" color={accent} lit={!released} top={LINE_Y - MODULE_TOP} />
        <Pad side="right" color={accent} lit={!released} top={LINE_Y - MODULE_TOP} />

        <div className="flex h-full flex-col px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className="rounded px-1.5 py-[3px] text-[8.5px] font-bold uppercase tracking-[0.14em]"
              style={{ background: released ? "var(--i-violet-soft)" : "var(--i-red-soft)", color: accent }}
            >
              {released ? "Released" : "Gate"}
            </span>
            <span className="ml-auto i-label">{shortId("D", decision.id)}</span>
          </div>

          <div className="mt-1.5 text-[12.5px] font-semibold leading-[1.25] text-[var(--i-text)] line-clamp-2">
            {decision.title}
          </div>
          <div className="mt-0.5 text-[10.5px] leading-snug text-[var(--i-text-faint)] line-clamp-1">
            {gate.dependency}
          </div>

          <div className="mt-auto">
            <TimingRail low={gate.low} likely={gate.likely} high={gate.high} accent={accent} />
            <div className="mt-1.5 flex items-center gap-2.5 text-[9.5px] text-[var(--i-text-faint)]">
              <span>→ {decision.scope.name}</span>
              <span>{decision.evidence.length} ev</span>
              {decision.owner && <span className="ml-auto truncate max-w-[70px]">{decision.owner}</span>}
            </div>
          </div>
        </div>
      </button>

      <button
        data-shoot={`assume-${gate.id}`}
        onClick={() => onAssume(!released)}
        className="absolute left-0 right-0 rounded px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] transition-all duration-500"
        style={{
          top: LINE_Y + 26,
          border: `1px solid ${released ? "var(--i-violet)" : "var(--i-border-strong)"}`,
          background: released ? "var(--i-violet-soft)" : "var(--i-panel)",
          color: released ? "var(--i-violet)" : "var(--i-text-soft)",
        }}
      >
        {released ? "Assumed decided · undo" : "Assume decided"}
      </button>
    </div>
  );
}

// The contact between a module and the conductor. Positioned on the
// module's lower lip rather than its centre, because that lip is what is
// actually plugged into the line.
function Pad({
  side,
  color,
  lit,
  top,
}: {
  side: "left" | "right";
  color: string;
  lit: boolean;
  top: number;
}) {
  return (
    <span
      aria-hidden
      className="absolute transition-all duration-500"
      style={{
        top: top - 7,
        [side]: -3,
        width: 6,
        height: 14,
        borderRadius: 2,
        background: lit ? color : "var(--i-border-strong)",
        boxShadow: lit ? `0 0 8px ${color === "var(--i-red)" ? "rgba(239,107,91,0.6)" : "rgba(155,140,250,0.5)"}` : "none",
      }}
    />
  );
}

// ── TIMING, AS ONE INSTRUMENT ──────────────────────────────────────────
// Three numbers in three boxes reads as a form. One track with the likely
// value dominant reads as a distribution, which is what it is.
export function TimingRail({
  low,
  likely,
  high,
  accent,
}: {
  low: number;
  likely: number;
  high: number;
  accent: string;
}) {
  const pos = Math.max(6, Math.min(94, ((likely - low) / Math.max(0.01, high - low)) * 100));
  return (
    <div className="i-meter flex items-center gap-2 px-2 py-1.5">
      <span className="text-[9.5px] tabular-nums text-[var(--i-text-faint)]">{low}d</span>
      <div className="relative h-[3px] flex-1 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div
          className="absolute inset-y-0 rounded-full transition-colors duration-500"
          style={{ left: "4%", right: "4%", background: accent, opacity: 0.32 }}
        />
        <span
          className="absolute rounded-full px-1.5 py-[1px] text-[9.5px] font-bold tabular-nums transition-colors duration-500"
          style={{
            left: `${pos}%`,
            top: -8,
            transform: "translateX(-50%)",
            background: accent,
            color: "var(--i-void)",
          }}
        >
          {likely}d
        </span>
      </div>
      <span className="text-[9.5px] tabular-nums text-[var(--i-text-faint)]">{high}d</span>
    </div>
  );
}

// ── THE DESTINATION ────────────────────────────────────────────────────
function Landmark({ node, constrained }: { node: CircuitNode; constrained: boolean }) {
  return (
    <div className="relative shrink-0" style={{ width: LANDMARK_W, height: ROW_H }}>
    <div
      data-shoot={`circuit-node-${node.id}`}
      className="i-control absolute left-0 right-0 px-4 py-3 transition-all duration-500"
      style={{
        top: LINE_Y - 62,
        borderColor: constrained ? "var(--i-red)" : "var(--i-mint)",
        boxShadow: constrained
          ? "0 0 0 3px rgba(239,107,91,0.10), 0 3px 10px rgba(0,0,0,0.5)"
          : "0 0 0 3px rgba(74,217,168,0.10), 0 3px 10px rgba(0,0,0,0.5)",
      }}
    >
      <Pad side="left" color={constrained ? "var(--i-red)" : "var(--i-mint)"} lit top={62} />
      <div className="flex items-center justify-between gap-2">
        <span className="i-label" style={{ color: "var(--i-text-soft)" }}>
          Delivery
        </span>
        {node.gateCount > 0 && (
          <span
            className="rounded-full px-1.5 py-[2px] text-[8.5px] font-bold uppercase tracking-[0.12em]"
            style={{ background: "var(--i-red-soft)", color: "var(--i-red)" }}
          >
            {node.gateCount} gate{node.gateCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="mt-1 text-[15px] font-semibold leading-tight text-[var(--i-text)]">{node.name}</div>
      <div className="mt-2 flex items-end gap-2">
        <span className="i-readout text-[22px] leading-none text-[var(--i-text)]">
          {node.likely ? fmtDay(node.likely) : "—"}
        </span>
        <span className="i-label pb-[2px]">likely</span>
      </div>
      {node.targetDate && (
        <div className="mt-1.5 text-[10px] text-[var(--i-text-faint)]">target {fmtDay(node.targetDate)}</div>
      )}
    </div>
    </div>
  );
}

function Downstream({ node }: { node: CircuitNode }) {
  return (
    <div className="relative shrink-0" style={{ width: DOWNSTREAM_W, height: ROW_H }}>
      <div
        data-shoot={`circuit-node-${node.id}`}
        className="i-meter absolute left-0 right-0 px-3 py-2.5"
        style={{ top: LINE_Y - 40, opacity: 0.72 }}
      >
        <div className="i-label">Waits on this</div>
        <div className="mt-1 text-[12.5px] font-medium text-[var(--i-text-soft)] truncate">{node.name}</div>
        <div className="mt-1 i-readout text-[13px] text-[var(--i-text-faint)]">
          {node.likely ? fmtDay(node.likely) : "—"}
        </div>
      </div>
    </div>
  );
}
