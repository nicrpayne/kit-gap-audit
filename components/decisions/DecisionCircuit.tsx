"use client";

// THE DECISION CIRCUIT — the instrument's one central claim, drawn.
//
// A delivery path runs left to right. Gating decisions are PHYSICALLY
// INSERTED into it: a conductor drops out of the delivery node onto a bus
// bar, and every gate module rises to meet that bus. Nothing else on the
// page touches the path. An open decision that gates nothing is drawn in
// its own lane below, unconnected, because that is the truth about it --
// the geometry teaches DECISION != GATE before any label is read.
//
// The path's nodes are REAL delivery landmarks only (§8): the project, its
// actual target date if it has one, its simulated landing, and the scopes
// that genuinely depend on it via Scope.dependsOnScopeIds. There is no
// Release model in this app, so the circuit does not draw one.

import { LANE_COLOR, shortId, type DecisionRow } from "@/lib/decisions/model";
import { fmtDay } from "@/lib/instrument/useProject";

export interface CircuitNode {
  id: string;
  name: string;
  /** Reality's landing for this node, when the simulation produced one. */
  likely: Date | null;
  targetDate: Date | null;
  gateCount: number;
}

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
  /** Open, serially gating decisions whose gate targets the origin node. */
  gates: DecisionRow[];
  assumedGateIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAssume: (gateId: string, assume: boolean) => void;
}) {
  const liveGates = gates.filter((d) => d.gate && !assumedGateIds.has(d.gate.id));
  const constrained = liveGates.length > 0;
  // The conductor's colour IS the state: red while something physically
  // holds the path, mint once nothing does. Never per-decision colour.
  const rail = constrained ? "var(--i-red)" : "var(--i-mint)";

  return (
    <div data-shoot="decision-circuit" className="px-5 pt-3 pb-1">
      <div className="flex items-baseline gap-3 mb-3">
        <span className="i-label" style={{ color: "var(--i-text-soft)" }}>
          Decision Circuit
        </span>
        <span className="text-[11px] text-[var(--i-text-faint)]">
          What&apos;s unresolved, what&apos;s gating, what moves delivery.
        </span>
      </div>

      {/* ── THE DELIVERY PATH ─────────────────────────────────────────── */}
      <div className="flex items-stretch gap-0">
        <PathTerminal
          label="Now"
          sub={startDate ? fmtDay(startDate) : "—"}
        />
        <Rail lit={!constrained} color={rail} />
        <DeliveryNode node={origin} constrained={constrained} primary />
        {downstream.map((n) => (
          <div key={n.id} className="flex items-stretch">
            <Rail lit={!constrained} color={rail} />
            <DeliveryNode node={n} constrained={false} primary={false} />
          </div>
        ))}
      </div>

      {/* ── THE BUS, AND WHAT HANGS OFF IT ────────────────────────────── */}
      {gates.length === 0 ? (
        <div
          data-shoot="circuit-clear"
          className="mt-3 flex items-center gap-2.5 rounded-md px-3 py-2.5"
          style={{ border: "1px dashed var(--i-border-strong)", background: "rgba(74,217,168,0.04)" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--i-mint)" }} />
          <span className="text-[11px]" style={{ color: "var(--i-mint)" }}>
            Path clear
          </span>
          <span className="text-[11px] text-[var(--i-text-faint)]">
            No decision is holding {origin.name}. Open decisions below have no forecast effect.
          </span>
        </div>
      ) : (
        <div className="relative mt-0">
          {/* The drop out of the delivery node, then the bus the gates ride. */}
          <div className="flex">
            <div style={{ width: TERMINAL_W + RAIL_W }} />
            <div className="relative" style={{ width: NODE_W }}>
              <div
                aria-hidden
                className="absolute left-1/2 top-0 transition-colors duration-300"
                style={{ width: 2, height: 18, marginLeft: -1, background: rail }}
              />
            </div>
          </div>
          <div className="relative" style={{ height: 20 }}>
            <div
              aria-hidden
              data-shoot="circuit-bus"
              className="absolute transition-colors duration-300"
              style={{ ...busGeometry(gates.length), top: 0, height: 2, background: rail }}
            />
          </div>

          <div className="flex gap-3 overflow-x-auto pb-1" style={{ paddingLeft: TERMINAL_W + RAIL_W }}>
            {gates.map((d) => (
              <GateModule
                key={d.id}
                decision={d}
                assumed={!!d.gate && assumedGateIds.has(d.gate.id)}
                selected={selectedId === d.id}
                onSelect={() => onSelect(d.id)}
                onAssume={(assume) => d.gate && onAssume(d.gate.id, assume)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const TERMINAL_W = 132;
const RAIL_W = 56;
const NODE_W = 230;
const GATE_W = 250;
const GATE_GAP = 12;
// The bus spans from the drop out of the delivery node to the LAST riser --
// no further. A bus that overshot its last gate would be drawing a
// conductor to nothing.
function busGeometry(n: number): { left: number; width: number } {
  const drop = TERMINAL_W + RAIL_W + NODE_W / 2;
  const lastRiser = TERMINAL_W + RAIL_W + (n - 1) * (GATE_W + GATE_GAP) + GATE_W / 2;
  const left = Math.min(drop, lastRiser) - 1;
  return { left, width: Math.abs(lastRiser - drop) + 2 };
}

// The rail IS the conduction. While a gate holds the path it is drawn
// dashed and dead; released, it is solid and lit. Colour alone would have
// been a label -- this is the path physically not conducting.
function Rail({ lit, color }: { lit: boolean; color: string }) {
  return (
    <div className="relative flex items-center" style={{ width: RAIL_W }}>
      <div
        aria-hidden
        className="w-full transition-all duration-300"
        style={{
          height: 2,
          background: lit
            ? color
            : "repeating-linear-gradient(90deg, var(--i-border-strong) 0 4px, transparent 4px 8px)",
        }}
      />
      <div
        aria-hidden
        className="absolute right-0 h-2 w-2 rounded-full transition-colors duration-300"
        style={{
          background: lit ? color : "transparent",
          border: `1px solid ${lit ? color : "var(--i-border-strong)"}`,
          marginRight: -1,
        }}
      />
    </div>
  );
}

function PathTerminal({ label, sub }: { label: string; sub: string }) {
  return (
    <div
      className="i-meter flex flex-col justify-center px-3 py-2.5"
      style={{ width: TERMINAL_W }}
    >
      <div className="i-label">{label}</div>
      <div className="mt-1 text-[13px] i-readout text-[var(--i-text-soft)]">{sub}</div>
    </div>
  );
}

function DeliveryNode({
  node,
  constrained,
  primary,
}: {
  node: CircuitNode;
  constrained: boolean;
  primary: boolean;
}) {
  return (
    <div
      data-shoot={`circuit-node-${node.id}`}
      className="i-control relative flex flex-col justify-center px-3.5 py-2.5 transition-shadow duration-300"
      style={{
        width: NODE_W,
        borderColor: constrained ? "var(--i-red)" : primary ? "var(--i-border-strong)" : "var(--i-border)",
        boxShadow: constrained
          ? "0 0 0 1px rgba(239,107,91,0.25), 0 2px 5px rgba(0,0,0,0.45)"
          : undefined,
        opacity: primary ? 1 : 0.72,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-[var(--i-text)] truncate">{node.name}</span>
        {node.gateCount > 0 && (
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]"
            style={{ background: "var(--i-red-soft)", color: "var(--i-red)" }}
          >
            {node.gateCount} gate{node.gateCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[15px] i-readout text-[var(--i-text)]">
          {node.likely ? fmtDay(node.likely) : "—"}
        </span>
        <span className="i-label">likely</span>
        {node.targetDate && (
          <span className="text-[10px] text-[var(--i-text-faint)] ml-auto">
            target {fmtDay(node.targetDate)}
          </span>
        )}
      </div>
    </div>
  );
}

// A gate module: a physical object seated in the delivery path, with a
// riser connecting it to the bus. Assuming it decided LIFTS it off the bus
// and dashes the riser -- the release is a movement, not a colour swap.
function GateModule({
  decision,
  assumed,
  selected,
  onSelect,
  onAssume,
}: {
  decision: DecisionRow;
  assumed: boolean;
  selected: boolean;
  onSelect: () => void;
  onAssume: (assume: boolean) => void;
}) {
  const gate = decision.gate!;
  const color = assumed ? "var(--i-reality)" : LANE_COLOR.gating;
  return (
    <div className="shrink-0" style={{ width: GATE_W }}>
      {/* riser into the bus */}
      <div className="relative" style={{ height: 16 }}>
        <div
          aria-hidden
          className="absolute left-1/2 top-0 transition-all duration-300"
          style={{
            width: 2,
            marginLeft: -1,
            height: assumed ? 8 : 16,
            background: assumed
              ? "repeating-linear-gradient(180deg, var(--i-border-strong) 0 3px, transparent 3px 6px)"
              : color,
          }}
        />
        <div
          aria-hidden
          className="absolute left-1/2 h-2.5 w-2.5 rounded-full transition-all duration-300"
          style={{
            marginLeft: -5,
            top: assumed ? 10 : 13,
            background: assumed ? "var(--i-panel)" : color,
            border: `1px solid ${assumed ? "var(--i-border-strong)" : color}`,
            boxShadow: assumed ? "none" : "0 0 8px rgba(239,107,91,0.55)",
          }}
        />
      </div>

      <button
        data-shoot={`gate-${gate.id}`}
        data-assumed={assumed ? "true" : "false"}
        onClick={onSelect}
        className="i-control w-full text-left px-3 py-2.5 transition-all duration-300"
        style={{
          borderColor: selected ? "var(--i-violet)" : assumed ? "var(--i-border)" : color,
          transform: assumed ? "translateY(-6px)" : "translateY(0)",
          opacity: assumed ? 0.6 : 1,
          boxShadow: assumed
            ? "0 8px 14px rgba(0,0,0,0.5)"
            : `0 0 0 1px rgba(239,107,91,0.2), 0 2px 5px rgba(0,0,0,0.45)`,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]"
            style={{
              background: assumed ? "rgba(107,114,120,0.18)" : "var(--i-red-soft)",
              color,
            }}
          >
            {assumed ? "Released" : "Gate"}
          </span>
          <span className="i-label ml-auto">{shortId("D", decision.id)}</span>
        </div>
        <div className="mt-1.5 text-[13px] font-semibold text-[var(--i-text)] leading-tight">
          {decision.title}
        </div>
        <div className="mt-0.5 text-[11px] text-[var(--i-text-faint)] line-clamp-1">{gate.dependency}</div>

        {/* Timing, as a range rather than a number -- the estimate is a
            distribution and the readout says so. */}
        <div className="i-meter mt-2 flex items-center gap-2 px-2 py-1.5">
          <span className="text-[10px] text-[var(--i-text-faint)]">{gate.low}d</span>
          <div className="relative flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="absolute inset-y-0 rounded-full"
              style={{ left: "10%", right: "10%", background: assumed ? "var(--i-reality)" : color, opacity: 0.5 }}
            />
            <div
              className="absolute -top-[3px] h-[7px] w-[7px] rounded-full"
              style={{
                left: `${clampPct(((gate.likely - gate.low) / Math.max(0.01, gate.high - gate.low)) * 100)}%`,
                marginLeft: -3.5,
                background: assumed ? "var(--i-reality)" : color,
              }}
            />
          </div>
          <span className="text-[10px] text-[var(--i-text-faint)]">{gate.high}d</span>
          <span className="text-[11px] i-readout" style={{ color }}>
            {gate.likely}d
          </span>
        </div>

        <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--i-text-faint)]">
          <span>→ {decision.scope.name}</span>
          <span>{decision.evidence.length} evidence</span>
          {decision.owner && <span className="truncate">{decision.owner}</span>}
        </div>
      </button>

      <button
        data-shoot={`assume-${gate.id}`}
        onClick={() => onAssume(!assumed)}
        className="mt-1.5 w-full rounded-md px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.1em] transition-colors"
        style={{
          border: `1px solid ${assumed ? "var(--i-violet)" : "var(--i-border-strong)"}`,
          background: assumed ? "var(--i-violet-soft)" : "transparent",
          color: assumed ? "var(--i-violet)" : "var(--i-text-soft)",
        }}
      >
        {assumed ? "Assumed decided · undo" : "Assume decided"}
      </button>
    </div>
  );
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 50));
