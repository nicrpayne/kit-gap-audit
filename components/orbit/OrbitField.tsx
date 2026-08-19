"use client";

// ORBIT — THE FIELD.
//
// One object. The forecast is the sun; everything else is arranged by what
// it does to the sun.
//
// ─────────────────────────────────────────────────────────────────────────
// VISUAL → SEMANTIC MAP. Every property below is read off the model. None
// is invented, and nothing here is a score.
//
//   THE HALO          the real Monte Carlo trials. Angle is the day axis,
//                     thickness at an angle is that day's trial density,
//                     mirrored about the halo's centreline — the same
//                     function the Living Forecast mirrors about its own
//                     horizontal centreline. Nested shells are isosurfaces
//                     of that same density, so the body is volumetric
//                     without any shape being invented.
//   ARC IS OPEN       240°, mouth at the bottom. A closed ring would put
//                     the last trial beside the first and claim time wraps.
//   OUTER BLOOM       confidence at target, and ONLY when a target exists.
//                     No target = flat neutral glow; the instrument will
//                     not judge without a reference.
//   HATCHED TAIL      the real trial mass landing after the target.
//   GHOST             Reality's own distribution while a Scenario runs.
//                     Spectral and unfilled: a memory, not a body.
//
//   CAPABILITY SIZE   area ∝ real remaining load in days. The ONLY thing
//                     size means. No importance, no priority, no health.
//   CAPABILITY EDGE   softness ∝ the estimate's own dispersion. A capability
//                     nobody has pinned down has a soft edge.
//
//   CAPACITY RAIL     width = RAW physical allocation. The bright core
//                     inside it = EFFECTIVE contribution. The dark margin
//                     between them is context-switch loss, and the strands
//                     peeling off it are where it goes. A starved project
//                     has the SAME geometry as a healthy one and a visibly
//                     thinner core — which is the point: starvation is a
//                     material, not a shape.
//   CAPACITY BRANCHES uniform width, deliberately. The model allocates
//                     capacity to a SCOPE, not to a capability, so varying
//                     them would be inventing an allocation.
//
//   GATE CLAMP        an unresolved decision is not a peer node. It is a
//                     band across everything the scope has, because that is
//                     exactly what the model says it blocks — a scope, not
//                     a capability. Flows are pinched where they cross it.
//                     Two gates nest, because serial gates really do stack.
//   RELEASED CLAMP    assumed answered: the band retracts to two stubs and
//                     the flows pass at full width.
//
//   DASHED / UNFILLED a machine's suggestion. Never solid, never causal.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useMemo, useReducer, useRef } from "react";
import type { OrbitGraph, OrbitNode, OrbitCapabilityNode } from "@/lib/orbit/graph";
import { relatedTo } from "@/lib/orbit/graph";
import { quantileSample } from "@/lib/forecast/shape";
import {
  FRAME,
  VIEWBOX,
  viewBoxAttr,
  RING,
  ARC,
  SECTOR,
  SECTOR_MID,
  polar,
  arcPath,
  dayToAngle,
  seats,
  across,
  haloShape,
  flowPath,
  flowAtRadius,
  capabilityRadius,
} from "@/lib/orbit/geometry";

const MORPH_MS = 900;
const CYAN: Rgb = [94, 200, 216]; // Reality
const VIOLET: Rgb = [155, 140, 250]; // Scenario
type Rgb = [number, number, number];
const rgb = (c: Rgb, a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Morph {
  q: number[];
  win: [number, number];
  col: Rgb;
}

/** One eased clock for geometry, window and colour, retargeting from the
    currently drawn state when interrupted. The forecast never teleports
    between two truths; it travels between them in quantile space, so every
    intermediate frame is an interpolation of two REAL distributions. */
function useMorph(target: Morph, enabled: boolean): Morph {
  const drawn = useRef<Morph>(target);
  const last = useRef<Morph>(target);
  const raf = useRef<number | null>(null);
  const [, force] = useReducer((c: number) => c + 1, 0);

  useEffect(() => {
    if (last.current === target) return;
    last.current = target;
    if (!enabled || drawn.current.q.length !== target.q.length) {
      drawn.current = target;
      force();
      return;
    }
    const from: Morph = { q: drawn.current.q.slice(), win: [...drawn.current.win], col: [...drawn.current.col] as Rgb };
    const t0 = performance.now();
    if (raf.current) cancelAnimationFrame(raf.current);
    const step = (now: number) => {
      const e = easeInOutCubic(Math.min(1, (now - t0) / MORPH_MS));
      drawn.current = {
        q: from.q.map((v, i) => v + (target.q[i] - v) * e),
        win: [from.win[0] + (target.win[0] - from.win[0]) * e, from.win[1] + (target.win[1] - from.win[1]) * e],
        col: [0, 1, 2].map((i) => Math.round(from.col[i] + (target.col[i] - from.col[i]) * e)) as Rgb,
      };
      force();
      if (e < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, enabled]);

  return drawn.current;
}

function useReducedMotion(): boolean {
  const ref = useRef(false);
  const [, force] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    ref.current = mq.matches;
    force();
    const on = () => {
      ref.current = mq.matches;
      force();
    };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return ref.current;
}

const fmt = (start: Date, day: number) =>
  new Date(start.getTime() + day * 86400000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const fmtShort = (start: Date, day: number) =>
  new Date(start.getTime() + day * 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function OrbitField({
  graph,
  startDate,
  selected,
  onSelect,
}: {
  graph: OrbitGraph;
  startDate: Date;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const reduced = useReducedMotion();

  const centre = graph.nodes.find((n): n is Extract<OrbitNode, { kind: "forecast" }> => n.kind === "forecast");
  const capabilities = graph.nodes.filter((n): n is OrbitCapabilityNode => n.kind === "capability");
  const gates = graph.nodes.filter((n) => n.kind === "gate");
  const capacities = graph.nodes.filter((n) => n.kind === "capacity");
  const dependencies = graph.nodes.filter((n) => n.kind === "dependency");

  // Gates that clamp the focused scope's own trunk, as opposed to one that
  // sits on an upstream project — those are drawn on that project's line.
  const trunkGates = gates.filter((g) => g.kind === "gate" && g.targetScopeId === graph.focusScopeId);

  const related = useMemo(() => (selected ? relatedTo(graph, selected) : null), [graph, selected]);
  const lit = (id: string) => !related || related.nodes.has(id);
  const litEdge = (id: string) => !related || related.edges.has(id);
  const dim = (id: string) => (lit(id) ? 1 : 0.1);

  // ── THE WINDOW ───────────────────────────────────────────────────────
  // Wide enough to hold both distributions so the ghost is comparable, and
  // the target so it can be read against them. A target far outside the
  // trials is pinned at the rim rather than being allowed to squash the
  // object into a sliver — and it says so.
  const win = useMemo(() => {
    if (!centre) return { lo: 0, hi: 1, targetBeyond: false };
    const live = centre.completionDaysSorted;
    const ghost = centre.realityCompletionDaysSorted;
    let lo = live[0];
    let hi = live[live.length - 1];
    if (ghost && ghost.length) {
      lo = Math.min(lo, ghost[0]);
      hi = Math.max(hi, ghost[ghost.length - 1]);
    }
    // Barely any padding: the object should fill its arc, because the arc
    // IS the object. A generous window would shrink the forecast into an
    // eyebrow and make an uncertain project look settled.
    const span = Math.max(1, hi - lo);
    lo -= span * 0.05;
    hi += span * 0.05;
    let targetBeyond = false;
    if (centre.targetDay !== null) {
      const t = centre.targetDay;
      const wantLo = Math.min(lo, t - span * 0.05);
      const wantHi = Math.max(hi, t + span * 0.05);
      // The trials must keep most of the arc or the object stops being
      // readable, which is a worse lie than an off-frame target.
      if (wantHi - wantLo <= span / 0.62) {
        lo = wantLo;
        hi = wantHi;
      } else {
        targetBeyond = true;
      }
    }
    return { lo, hi, targetBeyond };
  }, [centre]);

  const morphTarget = useMemo<Morph>(
    () => ({
      q: centre ? quantileSample(centre.completionDaysSorted) : [],
      win: [win.lo, win.hi],
      col: graph.scenarioActive ? VIOLET : CYAN,
    }),
    [centre, win.lo, win.hi, graph.scenarioActive]
  );
  const drawn = useMorph(morphTarget, !reduced);

  const halo = useMemo(
    () => (drawn.q.length ? haloShape(drawn.q, drawn.win[0], drawn.win[1], RING.haloMax, 0) : null),
    [drawn]
  );
  const shellA = useMemo(
    () => (drawn.q.length ? haloShape(drawn.q, drawn.win[0], drawn.win[1], RING.haloMax, 0.28) : null),
    [drawn]
  );
  const shellB = useMemo(
    () => (drawn.q.length ? haloShape(drawn.q, drawn.win[0], drawn.win[1], RING.haloMax, 0.58) : null),
    [drawn]
  );
  const ghost = useMemo(() => {
    const g = centre?.realityCompletionDaysSorted;
    if (!g || !g.length) return null;
    return haloShape(quantileSample(g), drawn.win[0], drawn.win[1], RING.haloMax, 0);
  }, [centre, drawn.win]);

  if (!centre || !halo) return null;

  const col = drawn.col;
  const angOf = (day: number) => dayToAngle(day, drawn.win[0], drawn.win[1]);
  const p50A = angOf(centre.p50);
  const targetA = centre.targetDay === null ? null : angOf(centre.targetDay);
  const conf = centre.confidenceAtTarget;

  // Bloom means coherence against a reference. Without a target there is no
  // reference, so the glow goes flat and neutral rather than guessing.
  const bloom = conf === null ? 0.13 : 0.08 + (conf / 100) * 0.34;

  const capSeats = seats(capabilities.length);
  const maxLoad = Math.max(0, ...capabilities.map((c) => c.loadDays));

  const clamped = trunkGates.filter((g) => g.kind === "gate" && !g.assumedResolved);
  const anyClamped = clamped.length > 0;

  return (
    <svg
      data-shoot="orbit-field"
      data-scenario={graph.scenarioActive ? "true" : "false"}
      viewBox={viewBoxAttr}
      className="h-full w-full"
      onClick={() => onSelect(null)}
      role="presentation"
    >
      {/* A label is a readout, never a target. */}
      <style>{`[data-shoot="orbit-field"] text { pointer-events: none; }`}</style>
      <defs>
        <radialGradient id={`sun-${uid}`}>
          <stop offset="0%" stopColor={rgb(col, 0.62)} />
          <stop offset="38%" stopColor={rgb(col, 0.3)} />
          <stop offset="72%" stopColor={rgb(col, 0.09)} />
          <stop offset="100%" stopColor={rgb(col, 0)} />
        </radialGradient>
        {/* The object's own light. Blurring the REAL density means the
            glow is brightest exactly where the probability is densest —
            the illumination is the data, not an effect placed near it. */}
        <filter id={`glow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="17" />
        </filter>
        <radialGradient id={`core-${uid}`}>
          <stop offset="0%" stopColor={rgb(col, 0.42)} />
          <stop offset="60%" stopColor={rgb(col, 0.1)} />
          <stop offset="100%" stopColor={rgb(col, 0)} />
        </radialGradient>
        <radialGradient id={`vign-${uid}`}>
          <stop offset="55%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
        </radialGradient>
        <pattern id={`miss-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)">
          <rect width="7" height="7" fill="transparent" />
          <line x1="0" y1="0" x2="0" y2="7" stroke={rgb(col, 0.5)} strokeWidth="1.1" />
        </pattern>
        {/* Everything inside the clamp radius, and everything outside it.
            A flow is drawn once per region so the pinch is exact rather
            than approximated by a decoration laid on top. */}
        <clipPath id={`inside-${uid}`}>
          <circle cx={FRAME.cx} cy={FRAME.cy} r={RING.gate} />
        </clipPath>
        <clipPath id={`outside-${uid}`} clipRule="evenodd">
          <path
            d={`M 0 0 H ${FRAME.size} V ${FRAME.size} H 0 Z M ${FRAME.cx - RING.gate} ${FRAME.cy} a ${RING.gate} ${RING.gate} 0 1 0 ${RING.gate * 2} 0 a ${RING.gate} ${RING.gate} 0 1 0 ${-RING.gate * 2} 0 Z`}
          />
        </clipPath>
        {targetA !== null && (
          <clipPath id={`late-${uid}`}>
            <path
              d={`M ${FRAME.cx} ${FRAME.cy} L ${polar(520, targetA).x} ${polar(520, targetA).y} A 520 520 0 ${ARC.startDeg + ARC.sweepDeg - targetA > 180 ? 1 : 0} 1 ${polar(520, ARC.startDeg + ARC.sweepDeg).x} ${polar(520, ARC.startDeg + ARC.sweepDeg).y} Z`}
            />
          </clipPath>
        )}
      </defs>

      {/* THE SUN'S OWN LIGHT. Two layers: a corona reaching past the halo,
          and a tight core. Brightness is confidence at target and nothing
          else — with no target both go flat, because the instrument has
          nothing to be confident against. */}
      <circle cx={FRAME.cx} cy={FRAME.cy} r={RING.halo - RING.haloMax + 22} fill={`url(#core-${uid})`} opacity={0.34 + bloom * 0.6} pointerEvents="none" />

      {/* THE DAY AXIS, as a rule. It runs the whole arc even where no trial
          lands, so the mouth reads as "time ends here" rather than as a
          shape that happens to stop — and so the halo is unmistakably an
          arc rather than a lobe floating at the top. */}
      <path
        d={arcPath(RING.halo, ARC.startDeg, ARC.startDeg + ARC.sweepDeg)}
        fill="none"
        stroke="var(--i-border-strong)"
        strokeOpacity={0.5}
        strokeWidth={1}
        pointerEvents="none"
      />

      {/* ── CAPACITY: the supply rail, outside everything it feeds ──── */}
      {capacities.map((c) => {
        if (c.kind !== "capacity") return null;
        const own = c.scopeId === graph.focusScopeId;
        if (!own) return null; // an upstream project's people ride its own line
        const raw = Math.max(0, c.raw);
        // WHAT THE SIMULATION RECEIVES. Under an aggregate override that is
        // the override, not the roster's reading — drawing the roster while
        // the date beside it was computed from something else would be the
        // instrument contradicting itself.
        const eff = Math.max(0, c.simulatedTotal ?? c.effective);
        const overridden = c.simulatedTotal !== null;
        // A stand-in figure is drawn as a stand-in: dashed, hollow, and
        // labelled. It is a real input to the date and a weaker claim than
        // a named team, and the picture has to carry both facts.
        const named = c.basis === "allocations";
        // PROPORTION IS THE WHOLE POINT. The core is the same fraction of
        // the channel that effective capacity is of raw, with no base
        // offset — an offset would flatten the ratio and make a starved
        // project look like a healthy one, which is exactly the failure the
        // audit warned about. And it is never exaggerated the other way:
        // a 12% loss is a 12% narrower core.
        const wRaw = 5 + Math.min(15, Math.max(raw, eff) * 2.8);
        const wEff = Math.max(0.8, wRaw * (Math.max(raw, eff) > 0 ? eff / Math.max(raw, eff) : 1));
        const o = dim(c.id);
        const strain = raw > 0 ? Math.max(0, 1 - eff / raw) : 0;
        return (
          <g
            key={c.id}
            opacity={o}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(selected === c.id ? null : c.id);
            }}
          >
            {/* A generous invisible band, so a person aiming at the rail
                hits it. Identity lives on the handle below, not on the
                group: a group's bounding box centre is a chord midpoint,
                which is nowhere near the arc it belongs to. */}
            <path
              d={arcPath(RING.rail, SECTOR.startDeg - 6, SECTOR.endDeg + 6)}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(26, wRaw + 18)}
            />
            <circle
              data-orbit-node={c.id}
              data-orbit-kind="capacity"
              data-capacity-raw={raw.toFixed(2)}
              data-capacity-effective={eff.toFixed(2)}
              data-capacity-strain={strain.toFixed(3)}
              data-capacity-missing={c.required.toFixed(2)}
              data-capacity-overridden={overridden ? "true" : "false"}
              data-capacity-basis={c.basis}
              cx={polar(RING.rail, SECTOR.startDeg - 6).x}
              cy={polar(RING.rail, SECTOR.startDeg - 6).y}
              r={9}
              fill="var(--i-void)"
              stroke="var(--i-signal)"
              strokeOpacity={0.75}
              strokeWidth={1.6}
            />
            {/* RAW: everything the roster physically puts on this project. */}
            <path
              d={arcPath(RING.rail, SECTOR.startDeg - 6, SECTOR.endDeg + 6)}
              fill="none"
              stroke="var(--i-signal)"
              strokeOpacity={0.13}
              strokeWidth={wRaw}
              strokeLinecap="round"
           
              pointerEvents="none"
            />
            {/* EFFECTIVE: what actually reaches the work after switching. */}
            <path
              data-shoot={`capacity-core-${c.scopeId}`}
              d={arcPath(RING.rail, SECTOR.startDeg - 6, SECTOR.endDeg + 6)}
              fill="none"
              stroke="var(--i-signal)"
              strokeOpacity={0.6}
              strokeWidth={wEff}
              strokeLinecap="round"
           
              pointerEvents="none"
            />
            {/* THE LOSS, GOING SOMEWHERE ELSE. Strands leave the rail
                outward — the time is not destroyed, it is spent on other
                projects, and the picture should say that. */}
            {strain > 0.02 &&
              across(Math.max(3, Math.min(7, c.splitPeople + 2)), SECTOR.startDeg + 6, SECTOR.endDeg - 6).map((a, i) => {
                const p0 = polar(RING.rail, a);
                const p1 = polar(RING.rail + 16 + strain * 92, a - 4 - strain * 7);
                return (
                  <path
                    key={i}
                    d={`M ${p0.x} ${p0.y} Q ${polar(RING.rail + 12, a - 1).x} ${polar(RING.rail + 12, a - 1).y}, ${p1.x} ${p1.y}`}
                    fill="none"
                    stroke="var(--i-signal)"
                    strokeOpacity={0.18 + strain * 0.75}
                    strokeWidth={1.5}
                    strokeDasharray="2 5"
                    strokeLinecap="round"
                  />
                );
              })}
            {/* ASKED FOR AND ABSENT. Reaches past the rail's end and does
                not arrive, because there is nobody there. */}
            {c.required > 0.01 && (
              <path
                data-shoot="capacity-missing"
                d={arcPath(RING.rail, SECTOR.endDeg + 8, SECTOR.endDeg + 8 + Math.min(24, c.required * 9))}
                fill="none"
                stroke="var(--i-amber)"
                strokeOpacity={0.5}
                strokeWidth={wRaw * 0.6}
                strokeDasharray="3 7"
                strokeLinecap="round"
              />
            )}
            {/* Horizontal, in the mouth's clear side. Curving it along the
                rail put it at 60 degrees and made it unreadable. */}
            <text
              x={FRAME.cx + 372}
              y={FRAME.cy + 172}
              textAnchor="end"
              className="i-readout"
              fill="var(--i-text-faint)"
              fontSize={13}
            >
              {overridden
                ? `simulating ${eff.toFixed(1)} FTE — the roster puts ${c.effective.toFixed(1)} here`
                : named
                  ? `${eff.toFixed(1)} of ${raw.toFixed(1)} FTE reaching this work`
                  : `about ${eff.toFixed(1)} people, counted from who is assigned`}
            </text>
          </g>
        );
      })}

      {/* NO PER-CAPABILITY FEED LINES. The model allocates capacity to a
          project, not to a capability, so drawing one line per capability
          would be inventing an allocation — and drawing them all identical
          adds clutter without adding truth. The rail spanning exactly the
          arc the work occupies is the whole honest statement. */}

      {/* ── LOAD FLOWS: outside the clamp, then inside it ───────────── */}
      {capSeats.map((a, i) => {
        const cap = capabilities[i];
        const r = capabilityRadius(cap.loadDays, maxLoad);
        const d = flowPath(RING.cap - r, a);
        const edgeId = `load:${cap.id}`;
        const o = (litEdge(edgeId) ? 1 : 0.08) * (cap.candidate ? 0.75 : 1);
        const w = cap.candidate ? 1.2 : 1.1 + Math.sqrt(Math.max(0, cap.loadDays)) * 0.9;
        return (
          <g key={edgeId} data-orbit-edge={edgeId} data-causal={cap.candidate ? "false" : "true"} data-orbit-edge-kind={cap.candidate ? "candidate" : "load"}>
            <path
              d={d}
              clipPath={`url(#outside-${uid})`}
              fill="none"
              stroke={cap.candidate ? "var(--i-text-faint)" : "var(--i-mint)"}
              strokeOpacity={(cap.candidate ? 0.5 : 0.78) * o}
              strokeWidth={w}
              strokeDasharray={cap.candidate ? "2 7" : undefined}
              strokeLinecap="round"
            />
            {/* Past the clamp. Narrowed and dimmed while a decision is
                unresolved — the work is not getting through yet. */}
            <path
              d={d}
              clipPath={`url(#inside-${uid})`}
              fill="none"
              stroke={cap.candidate ? "var(--i-text-faint)" : "var(--i-mint)"}
              strokeOpacity={(cap.candidate ? 0.36 : anyClamped ? 0.26 : 0.6) * o}
              strokeWidth={anyClamped && !cap.candidate ? Math.max(0.7, w * 0.3) : w}
              strokeDasharray={cap.candidate ? "2 7" : undefined}
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {/* ── DEPENDENCY: arrives where the outcome can first begin ───── */}
      {dependencies.map((d) => {
        if (d.kind !== "dependency") return null;
        // Sits in the mouth, just outside where time begins — because what
        // it does is hold back the earliest this project could finish.
        const a = ARC.startDeg + 4;
        const from = polar(RING.gate + 12, a);
        const to = polar(RING.halo, halo.a0);
        const edgeId = `waits_on:${graph.focusScopeId}:${d.scopeId}`;
        const gateHere = gates.find((g) => g.kind === "gate" && g.targetScopeId === d.scopeId && !g.assumedResolved);
        return (
          <g key={d.id} opacity={dim(d.id)}>
            <path
              data-orbit-edge={edgeId}
              data-causal="true"
              data-orbit-edge-kind="waits_on"
              d={`M ${from.x} ${from.y} Q ${polar(RING.gate, a + 2).x} ${polar(RING.gate, a + 2).y}, ${to.x} ${to.y}`}
              fill="none"
              stroke="var(--i-text-soft)"
              strokeOpacity={litEdge(edgeId) ? 0.4 : 0.06}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <circle
              data-orbit-node={d.id}
              data-orbit-kind="dependency"
              cx={from.x}
              cy={from.y}
              r={13}
              fill="var(--i-recess)"
              stroke="var(--i-text-soft)"
              strokeOpacity={0.7}
              strokeWidth={1.4}
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(selected === d.id ? null : d.id);
              }}
            />
            {gateHere && (
              <circle
                cx={polar(RING.gate, a + 2).x}
                cy={polar(RING.gate, a + 2).y}
                r={7}
                fill="none"
                stroke="var(--i-amber)"
                strokeWidth={2.2}
              />
            )}
            <text
              x={from.x - 20}
              y={from.y + 4}
              textAnchor="end"
              fill="var(--i-text-soft)"
              fontSize={13}
            >
              {d.label}
            </text>
          </g>
        );
      })}

      {/* ── THE HALO ─────────────────────────────────────────────────── */}
      {/* Reality, held while the Scenario moves over it. */}
      {ghost && (
        <g pointerEvents="none" data-shoot="orbit-ghost">
          {/* Reality, held while the Scenario moves. Deliberately flat and
              spectral — it is a memory, not a body — but filled, because
              two shapes on one axis is what makes the move legible. */}
          <path d={ghost.path} fill="var(--i-reality)" fillOpacity={0.16} />
          <path d={ghost.path} fill="none" stroke="var(--i-reality)" strokeOpacity={0.9} strokeWidth={1.1} strokeDasharray="5 5" />
        </g>
      )}
      <g data-shoot="orbit-halo" data-p50-day={centre.p50.toFixed(2)} pointerEvents="none">
        {/* Corona: the same body, blurred. Confidence sets how far it
            carries, so a project that will make its target burns brighter
            than one that will not — and with no target it stays flat. */}
        <path d={halo.path} fill={rgb(col, 0.55)} filter={`url(#glow-${uid})`} opacity={0.35 + bloom} />
        {/* Fills only. An outline would draw the near-zero tails as a wire
            and turn a taper into a stray line — the tails are real, and
            they should fade out exactly as the trial mass does. */}
        <path d={halo.path} fill={rgb(col, 0.26)} />
        {shellA && <path d={shellA.path} fill={rgb(col, 0.24)} />}
        {shellB && <path d={shellB.path} fill={rgb(col, 0.46)} />}
        {/* The real probability of missing: trial mass past the target. */}
        {targetA !== null && !win.targetBeyond && (
          <path data-shoot="orbit-miss-tail" d={halo.path} fill={`url(#miss-${uid})`} clipPath={`url(#late-${uid})`} opacity={0.75} />
        )}
      </g>

      {/* P50 — exact, and the only place a percentile touches the arc. */}
      <g data-shoot="orbit-p50" pointerEvents="none">
        <line
          x1={polar(RING.halo - RING.haloMax - 10, p50A).x}
          y1={polar(RING.halo - RING.haloMax - 10, p50A).y}
          x2={polar(RING.halo + RING.haloMax + 10, p50A).x}
          y2={polar(RING.halo + RING.haloMax + 10, p50A).y}
          stroke={rgb(col, 0.95)}
          strokeWidth={2}
        />
        <circle cx={polar(RING.halo + RING.haloMax + 10, p50A).x} cy={polar(RING.halo + RING.haloMax + 10, p50A).y} r={3.2} fill={rgb(col, 1)} />
      </g>

      {/* TARGET — a reference the outcome is measured against, drawn as a
          hard edge because it is not a forecast. */}
      {targetA !== null && (
        <g data-shoot="orbit-target" data-beyond={win.targetBeyond ? "true" : "false"} pointerEvents="none">
          <line
            x1={polar(RING.halo - RING.haloMax - 22, targetA).x}
            y1={polar(RING.halo - RING.haloMax - 22, targetA).y}
            x2={polar(RING.halo + RING.haloMax + 22, targetA).x}
            y2={polar(RING.halo + RING.haloMax + 22, targetA).y}
            stroke="var(--i-amber)"
            strokeOpacity={win.targetBeyond ? 0.45 : 0.9}
            strokeWidth={1.6}
            strokeDasharray={win.targetBeyond ? "3 6" : undefined}
          />
          {/* Inward, into the hollow — outward would sit under the clamp
              band and the two would read as one object. */}
          <text
            x={polar(RING.halo - RING.haloMax - 30, targetA).x}
            y={polar(RING.halo - RING.haloMax - 30, targetA).y}
            textAnchor="middle"
            className="i-label"
            fill="var(--i-amber)"
            fontSize={11}
          >
            {win.targetBeyond ? `${fmtShort(startDate, centre.targetDay!)} · past this view` : fmtShort(startDate, centre.targetDay!)}
          </text>
        </g>
      )}

      {/* ── THE CLAMP ────────────────────────────────────────────────── */}
      {trunkGates.map((g, i) => {
        if (g.kind !== "gate") return null;
        // Serial gates nest inward. Not decoration: the engine really does
        // add their delays one after another, so they are barriers in
        // series and the picture says so.
        const r = RING.gate - i * 24;
        const open = g.assumedResolved;
        const o = dim(g.id);
        const mid = SECTOR_MID;
        const half = (SECTOR.endDeg - SECTOR.startDeg) / 2 + 10;
        // Released: the band retracts to two stubs at the shoulders.
        const segs: [number, number][] = [[mid - half, mid + half]];
        return (
          <g
            key={g.id}
            opacity={o}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(selected === g.id ? null : g.id);
            }}
          >
            <path d={arcPath(r, mid - half, mid + half)} fill="none" stroke="transparent" strokeWidth={26} />
            {/* The clamp's own handle, on the band at its apex. */}
            <circle
              data-orbit-node={g.id}
              data-orbit-kind="gate"
              data-gate-state={open ? "released" : "clamped"}
              cx={polar(r, mid).x}
              cy={polar(r, mid).y}
              r={open ? 6 : 8}
              fill="var(--i-void)"
              stroke="var(--i-amber)"
              strokeOpacity={open ? 0.5 : 1}
              strokeWidth={open ? 1.6 : 2.4}
            />
            {segs.map(([a0, a1], k) => (
              <path
                key={k}
                d={arcPath(r, a0, a1)}
                fill="none"
                stroke="var(--i-amber)"
                strokeOpacity={open ? 0.3 : 0.8}
                strokeWidth={open ? 1.4 : 3.2}
                strokeDasharray={open ? "3 9" : undefined}
                strokeLinecap="round"
                pointerEvents="none"
              />
            ))}
            {/* Teeth. Only while it is actually holding. */}
            {!open &&
              across(9, mid - half + 6, mid + half - 6).map((a, k) => {
                const p0 = polar(r, a);
                const p1 = polar(r - 9, a);
                return <line key={k} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="var(--i-amber)" strokeOpacity={0.42} strokeWidth={1.8} pointerEvents="none" />;
              })}
            {/* Where each flow is actually pinched. */}
            {!open &&
              capSeats.map((a, k) => {
                const cap = capabilities[k];
                if (cap.candidate) return null;
                const p = flowAtRadius(RING.cap - capabilityRadius(cap.loadDays, maxLoad), a, r);
                return <circle key={k} cx={p.x} cy={p.y} r={3.4} fill="var(--i-amber)" fillOpacity={0.95} pointerEvents="none" />;
              })}
            {/* Each obstruction names itself along its own band. Two clamps
                can never write over each other, and nothing clips against
                the frame. */}
            <path id={`gatetext-${uid}-${i}`} d={arcPath(r - 13, mid - half, mid + half)} fill="none" />
            <text fill="var(--i-amber)" fontSize={12.5} opacity={open ? 0.5 : 1} textAnchor="middle">
              <textPath href={`#gatetext-${uid}-${i}`} startOffset="50%">
                <tspan className="i-readout">{open ? "released" : `${g.likely}d`}</tspan>
                <tspan fill="var(--i-text-soft)"> · {g.label.length > 30 ? `${g.label.slice(0, 29)}…` : g.label}</tspan>
              </textPath>
            </text>
          </g>
        );
      })}

      {/* ── CAPABILITIES ─────────────────────────────────────────────── */}
      {capSeats.map((a, i) => {
        const cap = capabilities[i];
        const r = capabilityRadius(cap.loadDays, maxLoad);
        const p = polar(RING.cap, a);
        const isSel = selected === cap.id;
        const o = dim(cap.id);
        // Softness is the estimate's own dispersion. Nothing else.
        const soft = Math.min(3.4, Math.max(0, cap.uncertainty) * 1.5);
        // Labels sit OUTWARD, in the clear band between the work and its
        // supply — inward would put them over the forecast.
        const lbl = polar(RING.cap + r + 17, a);
        return (
          <g
            key={cap.id}
            opacity={o}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(isSel ? null : cap.id);
            }}
          >
            <circle
              data-orbit-node={cap.id}
              data-orbit-kind="capability"
              data-candidate={cap.candidate ? "true" : "false"}
              data-load-days={cap.loadDays.toFixed(2)}
              cx={p.x}
              cy={p.y}
              r={r}
              fill={cap.candidate ? "transparent" : "var(--i-recess)"}
              stroke={cap.candidate ? "var(--i-text-faint)" : "var(--i-mint)"}
              strokeOpacity={cap.candidate ? 0.85 : isSel ? 1 : 0.8}
              strokeWidth={isSel ? 2.6 : 1.6}
              strokeDasharray={cap.candidate ? "2 6" : undefined}
              style={soft > 0.2 ? { filter: `blur(${soft.toFixed(2)}px)` } : undefined}
            />
            {/* A crisp hairline under the soft edge, so an uncertain
                capability is still a definite object. */}
            {soft > 0.2 && (
              <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={cap.candidate ? "var(--i-text-faint)" : "var(--i-mint)"} strokeOpacity={0.22} strokeWidth={0.8} />
            )}
            <text x={lbl.x} y={lbl.y} textAnchor="middle" fill="var(--i-text)" fontSize={13} opacity={0.9}>
              {cap.label.length > 20 ? `${cap.label.slice(0, 19)}…` : cap.label}
            </text>
            <text x={lbl.x} y={lbl.y + 14} textAnchor="middle" className="i-readout" fill="var(--i-text-faint)" fontSize={11}>
              {cap.candidate ? "suggested" : `${cap.loadDays.toFixed(1)}d`}
            </text>
          </g>
        );
      })}

      {/* What the resting view chose not to draw, admitted rather than
          hidden. Sits in the mouth, where nothing else lives. */}
      {graph.omitted.capabilities > 0 && (
        <text
          data-shoot="orbit-omitted"
          x={FRAME.cx}
          y={FRAME.cy + 214}
          textAnchor="middle"
          fill="var(--i-text-faint)"
          fontSize={12}
        >
          {graph.omitted.capabilities} smaller {graph.omitted.capabilities === 1 ? "capability" : "capabilities"} not shown ·{" "}
          {graph.omitted.capabilityLoadDays.toFixed(1)}d
        </text>
      )}

      {/* ── THE READOUT ──────────────────────────────────────────────── */}
      <g
        style={{ cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(selected === centre.id ? null : centre.id);
        }}
      >
        <circle
          data-orbit-node={centre.id}
          data-orbit-kind="forecast"
          cx={FRAME.cx}
          cy={FRAME.cy}
          r={RING.core + 42}
          fill="transparent"
        />
        <text x={FRAME.cx} y={FRAME.cy - 34} textAnchor="middle" className="i-label" fill="var(--i-text-faint)" fontSize={11}>
          Likely
        </text>
        <text
          data-shoot="orbit-centre-p50"
          x={FRAME.cx}
          y={FRAME.cy - 2}
          textAnchor="middle"
          fill="var(--i-text)"
          fontSize={30}
          className="i-readout"
        >
          {fmt(startDate, centre.p50)}
        </text>
        {centre.targetDay !== null ? (
          <text
            data-shoot="orbit-centre-confidence"
            x={FRAME.cx}
            y={FRAME.cy + 28}
            textAnchor="middle"
            fill="var(--i-amber)"
            fontSize={14}
            className="i-readout"
          >
            {conf}% by {fmtShort(startDate, centre.targetDay)}
          </text>
        ) : (
          <text data-shoot="orbit-centre-confidence" x={FRAME.cx} y={FRAME.cy + 28} textAnchor="middle" fill="var(--i-text-faint)" fontSize={13}>
            no target set
          </text>
        )}
        {centre.realityP50 !== null && Math.abs(centre.realityP50 - centre.p50) >= 0.5 && (
          <text
            data-shoot="orbit-shift"
            x={FRAME.cx}
            y={FRAME.cy + 52}
            textAnchor="middle"
            fill="var(--i-violet)"
            fontSize={12}
            className="i-readout"
          >
            {Math.round(centre.realityP50 - centre.p50)}d earlier than Reality
          </text>
        )}
      </g>

      <rect
        x={VIEWBOX.x}
        y={VIEWBOX.y}
        width={VIEWBOX.w}
        height={VIEWBOX.h}
        fill={`url(#vign-${uid})`}
        pointerEvents="none"
      />
    </svg>
  );
}
