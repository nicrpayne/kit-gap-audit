"use client";

// THE DECISION CIRCUIT — the hero object of this instrument.
//
// One conductor runs left to right inside a machined groove, from the NOW
// input terminal to the DELIVERY output terminal. Where a decision gates
// delivery, the groove opens into a SOCKET and a constraint cartridge is
// seated in it: the conductor stops dead at the cartridge's contact
// fingers and does not cross. That is not decoration -- sampleOwnDays adds
// each gate's duration IN SERIES, so a live gate is a point delivery
// genuinely cannot pass, and the picture says exactly that.
//
// Assuming a gate decided unlatches the cartridge, withdraws it clear of
// the groove, and closes a lit conductor through the socket it vacated.
// The socket STAYS VISIBLE: Reality still holds that decision open, and
// the empty seat is where it goes back to.
//
// Every node is a real delivery landmark -- the project, its actual
// targetDate, its simulated landing, and the scopes that genuinely list it
// in dependsOnScopeIds. There is no Release model in this app and the
// circuit does not draw one.

import { Fragment } from "react";

import DecisionModule from "@/components/decisions/DecisionModule";
import { shortId, type DecisionRow } from "@/lib/decisions/model";
import { fmtDay } from "@/lib/instrument/useProject";

export interface CircuitNode {
  id: string;
  name: string;
  likely: Date | null;
  targetDate: Date | null;
  gateCount: number;
}

// One geometry, shared by the row, the groove and every socket, so a
// conductor can never end somewhere a cartridge does not begin.
//
// SEG_W is a conductor run's MINIMUM. Runs are the only elastic part of
// the machine: they absorb whatever width the well has spare so the bus
// spans the chassis edge to edge, with the input hard left and the last
// node hard right. A machine that stops two thirds of the way across its
// own housing reads as a diagram floating on a page, which is exactly the
// failure this pass exists to kill.
const IN_W = 132;
const SEG_W = 54;
const OUT_W = 262;
const DOWN_W = 190;
const ROW_H = 328;

// Cartridges come in two widths. Three or more seated in one path pushed
// the OUTPUT terminal off the end of the well, and the output is the thing
// the whole machine exists to report -- a rack may scroll, but not past
// its own readout. Past the tight width they would stop being legible, so
// beyond that the well scrolls instead of shrinking further.
const GATE_W_WIDE = 268;
const GATE_W_TIGHT = 200;
const gateWidthFor = (n: number) => (n >= 3 ? GATE_W_TIGHT : GATE_W_WIDE);

// The conductor's centre line, measured from the top of the row. A seated
// cartridge is anchored by its BOTTOM to this line, so its contact edge is
// the thing touching the groove -- the release latch rides on top as an
// ejector rail, which keeps the whole assembly clear of the conductor when
// it withdraws. Anchoring by the top instead let the groove run straight
// through the middle of the cartridge, which said nothing.
//
// LINE_Y also reserves LIFT plus margin of headroom above a seated
// assembly, so a withdrawn cartridge has somewhere to go instead of being
// clipped by the top of the well.
const LINE_Y = 272;
const LIFT = 52;

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
      in DETERMINISTIC PRESENTATION ORDER (oldest recorded first). The
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
  const gateW = gateWidthFor(gates.length);

  return (
    <div data-shoot="decision-circuit" className="px-6 pt-3">
      <div className="mb-2 flex items-baseline gap-3">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.2em] text-[var(--i-text)]">
          Decision Circuit
        </span>
        <span className="text-[11px] text-[var(--i-text-faint)]">
          What&apos;s unresolved, what&apos;s gating, what moves delivery.
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full transition-colors duration-500"
            style={{
              background: constrained ? "var(--i-red)" : "var(--i-mint)",
              boxShadow: constrained ? "0 0 8px rgba(239,107,91,0.8)" : "0 0 8px rgba(74,217,168,0.8)",
            }}
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

      {/* THE WELL. Everything below is cut into this one recess, which is
          what stops the circuit reading as a diagram drawn over a page. */}
      <div className="dc-well overflow-hidden">
        <div className="overflow-x-auto px-5">
        {/* width:max-content floors at 100%, so the row is never narrower
            than its housing and never clips its contents. Whichever wins,
            the conductor runs take the difference. */}
        <div
          className="relative flex items-start"
          style={{ height: ROW_H, width: "max-content", minWidth: "100%" }}
        >
          <InputTerminal value={startDate ? fmtDay(startDate) : "—"} />

          {gates.length === 0 ? (
            <Conductor lit />
          ) : (
            gates.map((d) => {
              const released = !!d.gate && assumedGateIds.has(d.gate.id);
              return (
                <Fragment key={d.id}>
                  <Conductor lit={released} broken={!released} />
                  <GateSocket
                    decision={d}
                    width={gateW}
                    released={released}
                    selected={selectedId === d.id}
                    onSelect={() => onSelect(d.id)}
                    onAssume={(assume) => d.gate && onAssume(d.gate.id, assume)}
                  />
                </Fragment>
              );
            })
          )}

          <Conductor lit={!constrained} broken={constrained} />
          <OutputTerminal node={origin} constrained={constrained} />

          {downstream.map((n) => (
            <Fragment key={n.id}>
              <Conductor lit={!constrained} broken={constrained} dim />
              <Downstream node={n} />
            </Fragment>
          ))}
        </div>
        </div>

        {/* The chassis label strip. This caveat is a statement ABOUT the
            machine, so it is engraved on the machine rather than left
            floating on the page underneath it. */}
        {gates.length > 1 && (
          <p
            className="px-5 py-1.5 text-[10px] text-[var(--i-text-faint)]"
            style={{ borderTop: "1px solid #05080a", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}
          >
            Shown oldest first. The engine adds these in series but knows of no order between them — this is
            presentation order, not a claim about which must be settled first.
          </p>
        )}
      </div>
    </div>
  );
}

// ── THE CONDUCTOR, IN ITS GROOVE ───────────────────────────────────────
// Lit: current flows and the groove glows faintly around it. Broken: it
// does not, and the run ends in a hard terminal face rather than fading.
function Conductor({ lit, broken, dim }: { lit?: boolean; broken?: boolean; dim?: boolean }) {
  return (
    <div className="relative" style={{ flex: `1 0 ${SEG_W}px`, height: ROW_H }}>
      <div
        aria-hidden
        className="dc-groove absolute left-0 right-0"
        style={{ top: LINE_Y - 6, height: 12, opacity: dim ? 0.7 : 1 }}
      />
      <div
        aria-hidden
        className="absolute left-0 right-0 transition-all duration-500"
        style={{
          top: LINE_Y - 1.5,
          height: 3,
          borderRadius: 999,
          opacity: dim ? 0.5 : 1,
          background: broken
            ? "repeating-linear-gradient(90deg, rgba(239,107,91,0.45) 0 3px, transparent 3px 8px)"
            : lit
              ? "linear-gradient(90deg, var(--i-mint), #6fe6c0)"
              : "var(--i-border-strong)",
          boxShadow: lit && !broken ? "0 0 10px rgba(74,217,168,0.55)" : undefined,
        }}
      />
    </div>
  );
}

/** The current's entry face on a terminal or cartridge. */
function ContactFace({ side, color, lit }: { side: "left" | "right"; color: string; lit: boolean }) {
  return (
    <span
      aria-hidden
      className="absolute transition-all duration-500"
      style={{
        top: LINE_Y - 9,
        [side]: -4,
        width: 7,
        height: 18,
        borderRadius: 2,
        background: lit ? color : "#2a3339",
        boxShadow: lit ? `0 0 10px ${color}` : "inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    />
  );
}

// ── INPUT TERMINAL ─────────────────────────────────────────────────────
function InputTerminal({ value }: { value: string }) {
  return (
    <div className="relative shrink-0" style={{ width: IN_W, height: ROW_H }}>
      <div
        className="absolute left-0 right-0"
        style={{
          top: LINE_Y - 44,
          height: 88,
          borderRadius: 8,
          background: "linear-gradient(180deg, #1c2329 0%, #12181c 100%)",
          border: "1px solid #2b333a",
          borderTopColor: "#3d474f",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 3px 8px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex h-full flex-col justify-center px-3.5">
          <div className="i-label" style={{ fontSize: 8.5 }}>
            Input
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-[var(--i-text-soft)]">Now</div>
          <div className="mt-1 i-readout text-[16px] text-[var(--i-text)]">{value}</div>
        </div>
        <ContactFace side="right" color="var(--i-mint)" lit />
      </div>
    </div>
  );
}

// ── THE SOCKET AND ITS CARTRIDGE ───────────────────────────────────────
function GateSocket({
  decision,
  width,
  released,
  selected,
  onSelect,
  onAssume,
}: {
  decision: DecisionRow;
  width: number;
  released: boolean;
  selected: boolean;
  onSelect: () => void;
  onAssume: (assume: boolean) => void;
}) {
  const gate = decision.gate!;
  const accent = released ? "var(--i-violet)" : "var(--i-red)";

  return (
    <div className="relative shrink-0" style={{ width, height: ROW_H }}>
      {/* The groove continues behind the socket; the socket is cut deeper
          into it and stays visible whether or not anything is seated. */}
      <div
        aria-hidden
        className="dc-groove absolute left-0 right-0"
        style={{ top: LINE_Y - 6, height: 12 }}
      />
      {/* The seat, with its contact bank drawn INSIDE it. The cartridge's
          own fingers land on these, so at rest you see the mating happen
          and when the cartridge withdraws you are looking down into a hole
          that still has contacts in it -- not at a dashed placeholder. */}
      <div
        aria-hidden
        data-shoot={`socket-${gate.id}`}
        className="dc-socket absolute transition-all duration-500"
        style={{
          left: 4,
          right: 4,
          top: LINE_Y - 15,
          height: 32,
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.045) 0 2px, transparent 2px 10px)",
          boxShadow: released
            ? "inset 0 4px 11px rgba(0,0,0,0.95), inset 0 -1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(155,140,250,0.32), 0 0 14px rgba(155,140,250,0.12)"
            : undefined,
        }}
      />
      {/* The machined rim of the seat: one bright hair on the top lip. */}
      <div
        aria-hidden
        className="absolute transition-opacity duration-500"
        style={{
          left: 4,
          right: 4,
          top: LINE_Y - 15,
          height: 1,
          background: released ? "rgba(155,140,250,0.5)" : "rgba(255,255,255,0.09)",
        }}
      />
      {/* The closed conductor: only exists once the socket is empty. */}
      <div
        aria-hidden
        className="absolute transition-all duration-500"
        style={{
          left: 0,
          right: 0,
          top: LINE_Y - 1.5,
          height: 3,
          borderRadius: 999,
          background: released ? "linear-gradient(90deg, #6fe6c0, var(--i-mint), #6fe6c0)" : "transparent",
          boxShadow: released ? "0 0 11px rgba(74,217,168,0.6)" : undefined,
        }}
      />

      {/* The assembly -- latch plus cartridge -- is what actually travels
          out of the socket, so it carries the displacement a proof reads. */}
      <div
        data-shoot={`assembly-${gate.id}`}
        data-assumed={released ? "true" : "false"}
        className="absolute left-0 right-0 transition-transform duration-500"
        style={{ bottom: ROW_H - LINE_Y, transform: released ? `translateY(-${LIFT}px)` : "translateY(0)" }}
      >
        {/* THE EJECTOR RAIL. Mounted on the cartridge's top edge, the way a
            rack module's latch is: you operate the object, not a form. */}
        <button
          data-shoot={`assume-${gate.id}`}
          data-assumed={released ? "true" : "false"}
          aria-pressed={released}
          onClick={() => onAssume(!released)}
          className="dc-latch mb-1 flex w-full items-center gap-2 px-2 py-[5px] transition-all duration-300"
          style={{
            borderColor: released ? "var(--i-violet)" : undefined,
            background: released ? "linear-gradient(180deg, #2b2a44 0%, #1e1d30 100%)" : undefined,
          }}
        >
          <span
            aria-hidden
            className="h-[7px] w-[7px] shrink-0 rounded-full transition-all duration-300"
            style={{
              background: released ? "var(--i-violet)" : "#39434b",
              boxShadow: released ? "0 0 7px var(--i-violet)" : "inset 0 1px 1px rgba(0,0,0,0.6)",
            }}
          />
          <span
            className="text-[8.5px] font-bold uppercase tracking-[0.16em] transition-colors duration-300"
            style={{ color: released ? "var(--i-violet)" : "var(--i-text-soft)" }}
          >
            {released ? "Released · relatch" : "Assume decided"}
          </span>
          <span aria-hidden className="dc-latch-grip ml-auto h-3 w-7 rounded-[2px] opacity-70" />
        </button>

        <DecisionModule
          flipId={decision.id}
          shoot={`gate-${gate.id}`}
          seating="inserted"
          accent={accent}
          chip={released ? "Released" : "Gate"}
          ident={shortId("D", decision.id)}
          title={decision.title}
          sub={gate.dependency}
          width={width}
          selected={selected}
          dimmed={released}
          assumed={released}
          onClick={onSelect}
          meta={[
            { label: `→ ${decision.scope.name}` },
            { label: `${decision.evidence.length} ev` },
            ...(decision.owner ? [{ label: decision.owner }] : []),
          ]}
        >
          <TimingRail low={gate.low} likely={gate.likely} high={gate.high} accent={accent} />
        </DecisionModule>
      </div>

      <ContactFace side="left" color={accent} lit={!released} />
      <ContactFace side="right" color={accent} lit={!released} />
    </div>
  );
}

// ── TIMING, AS ONE INSTRUMENT ──────────────────────────────────────────
// Three numbers in three boxes reads as a form. One track with the likely
// value dominant reads as a distribution, which is what it is. The same
// language is used in the inspector and in the connect tool.
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
  const pos = Math.max(7, Math.min(93, ((likely - low) / Math.max(0.01, high - low)) * 100));
  return (
    <div
      className="mt-2 rounded px-2 pb-1.5 pt-2"
      style={{ background: "var(--i-recess)", boxShadow: "inset 0 2px 5px rgba(0,0,0,0.65)" }}
    >
      <div className="relative h-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="absolute inset-y-0 rounded-full transition-colors duration-500"
          style={{ left: "3%", right: "3%", background: accent, opacity: 0.35 }}
        />
        <span
          className="absolute rounded-full transition-colors duration-500"
          style={{
            left: `${pos}%`,
            top: -2.5,
            width: 8,
            height: 8,
            transform: "translateX(-50%)",
            background: accent,
            boxShadow: `0 0 7px ${accent}`,
          }}
        />
      </div>
      <div className="mt-1.5 flex items-baseline">
        <span className="flex-1 text-[9px] tabular-nums text-[var(--i-text-faint)]">{low}d</span>
        <span className="i-readout text-[13px] leading-none transition-colors duration-500" style={{ color: accent }}>
          {likely}
          <span className="text-[9px] font-normal text-[var(--i-text-faint)]">d</span>
        </span>
        <span className="flex-1 text-right text-[9px] tabular-nums text-[var(--i-text-faint)]">{high}d</span>
      </div>
    </div>
  );
}

// ── OUTPUT TERMINAL ────────────────────────────────────────────────────
// Where the signal arrives. The date sits in a cut-in display window, not
// on a card, and a state lamp above it reports whether current reached it.
function OutputTerminal({ node, constrained }: { node: CircuitNode; constrained: boolean }) {
  const tone = constrained ? "var(--i-red)" : "var(--i-mint)";
  return (
    <div className="relative shrink-0" style={{ width: OUT_W, height: ROW_H }}>
      <div
        data-shoot={`circuit-node-${node.id}`}
        className="absolute left-0 right-0 transition-all duration-500"
        style={{
          top: LINE_Y - 84,
          borderRadius: 9,
          background: "linear-gradient(180deg, #222a30 0%, #161c21 55%, #12171b 100%)",
          border: `1px solid ${tone}`,
          borderTopColor: "#4a545c",
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 3px ${constrained ? "rgba(239,107,91,0.09)" : "rgba(74,217,168,0.09)"}, 0 5px 14px rgba(0,0,0,0.6)`,
        }}
      >
        <div className="px-4 pb-3 pt-2.5">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-[7px] w-[7px] rounded-full transition-all duration-500"
              style={{ background: tone, boxShadow: `0 0 8px ${tone}` }}
            />
            <span className="i-label" style={{ fontSize: 8.5 }}>
              Output
            </span>
            {node.gateCount > 0 && (
              <span
                className="ml-auto rounded px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-[0.12em]"
                style={{ background: "var(--i-red-soft)", color: "var(--i-red)" }}
              >
                {node.gateCount} gate{node.gateCount === 1 ? "" : "s"}
              </span>
            )}
          </div>

          <div className="mt-1.5 text-[15px] font-semibold leading-tight text-[var(--i-text)]">{node.name}</div>

          {/* The display window: cut in, unlit, unmistakably a readout. */}
          <div
            className="mt-2 flex items-end gap-2 rounded px-3 py-2"
            style={{ background: "#05080a", boxShadow: "inset 0 3px 8px rgba(0,0,0,0.9)" }}
          >
            <span className="i-readout text-[26px] leading-none text-[var(--i-text)]">
              {node.likely ? fmtDay(node.likely) : "—"}
            </span>
            <span className="i-label pb-[3px]" style={{ fontSize: 8.5 }}>
              likely
            </span>
            {node.targetDate && (
              <span className="ml-auto pb-[3px] text-[9.5px] text-[var(--i-text-faint)]">
                target {fmtDay(node.targetDate)}
              </span>
            )}
          </div>
        </div>
        <ContactFace side="left" color={tone} lit />
      </div>
    </div>
  );
}

function Downstream({ node }: { node: CircuitNode }) {
  return (
    <div className="relative shrink-0" style={{ width: DOWN_W, height: ROW_H }}>
      <div
        data-shoot={`circuit-node-${node.id}`}
        className="absolute left-0 right-0 rounded-md px-3 py-2.5"
        style={{
          top: LINE_Y - 38,
          background: "var(--i-recess)",
          border: "1px solid #1c2227",
          boxShadow: "inset 0 2px 6px rgba(0,0,0,0.6)",
          opacity: 0.78,
        }}
      >
        <div className="i-label" style={{ fontSize: 8.5 }}>
          Waits on this
        </div>
        <div className="mt-1 truncate text-[12px] font-medium text-[var(--i-text-soft)]">{node.name}</div>
        <div className="mt-1 i-readout text-[13px] text-[var(--i-text-faint)]">
          {node.likely ? fmtDay(node.likely) : "—"}
        </div>
      </div>
    </div>
  );
}
