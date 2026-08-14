"use client";

// A CAPABILITY MODULE — the instrument unit of the Scope Composer.
//
// ── COLOUR ───────────────────────────────────────────────────────────────
// Hue is MATERIAL, not measurement. Every capability that is accepted Reality
// and live in this release shares one signal colour, because they are all the
// same kind of thing. Certainty is not a hue — it is legible in the shape of
// the distribution, which is where it actually lives.
//
//   signal (cyan)   accepted, seated, carrying work in this release
//   violet          unsettled: a Hermes candidate or an unsaved draft
//   amber           unmapped work — a coverage gap, not a capability
//   graphite        parked: powered down, out of this release, still Reality
//
// ── THE DISPLAY ──────────────────────────────────────────────────────────
// The distribution window is the module's instrument. Inside its glass:
//
//   horizontal      days. The window's drawn span IS the capability's
//                   low→high range, and the printed numbers sit at the exact
//                   x the curve reaches — the labels are the axis.
//   drawn width     that range against the release's widest range, so a
//                   badly-bounded capability is visibly wider than a
//                   well-bounded one across the whole deck.
//   curve           the triangular density of the summed three-point range.
//   peak height     concentration, which is what a density normalised to
//                   unit area does. A taller curve is a SURER capability,
//                   never a bigger one — size is the readout above.
//   locator         the likely value, carrying its own number.
//   ghost           where Reality's distribution sits, when a Scenario
//                   re-estimate has moved this one off it.
//
// Nothing here glows because it exists. Light means active, changing, or
// being touched.

import { motion } from "motion/react";
import { uncertaintyLabel, type Feature, type ThreePoint } from "@/lib/scope/features";

export type Material = "seated" | "spectral" | "raw" | "out";

export function materialOf(f: Feature): Material {
  if (f.bypassed) return "out";
  if (f.source === "unmapped") return "raw";
  if ((f.source === "hermes" || f.source === "manual") && !f.accepted) return "spectral";
  return "seated";
}

export const MODULE_H = 214;

/** One family per material. Certainty deliberately does not appear here. */
export function accentFor(material: Material): string {
  if (material === "raw") return "var(--i-amber)";
  if (material === "spectral") return "var(--i-violet)";
  if (material === "out") return "var(--i-reality)";
  return "var(--i-signal)";
}

function classLabel(f: Feature): string | null {
  if (f.source === "linear" || f.source === "unmapped") return null;
  if (f.accepted) return f.source === "hermes" ? "Accepted" : "Draft";
  return f.source === "hermes" ? "Candidate" : "Draft";
}

// ── SIGILS ───────────────────────────────────────────────────────────────
// Eight neutral geometric glyphs; a stable hash of the name picks one. An
// identity anchor the eye can find again — deliberately NOT domain icons,
// which would be a semantic claim the model does not make.
const SIGILS = [
  "M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z", // grid
  "M12 4l8 4-8 4-8-4zM4 13l8 4 8-4M4 17l8 4 8-4", // layers
  "M7 4h7l4 4v12H7zM14 4v4h4", // sheet
  "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z", // shield
  "M13 3L5 14h6l-1 7 8-11h-6z", // bolt
  "M4 14c2-6 5-6 8 0s6 6 8 0", // wave
  "M12 3l8 5-8 5-8-5zM4 13v4l8 5 8-5v-4", // crate
  "M9 12a3 3 0 013-3h5a3 3 0 010 6h-2M15 12a3 3 0 01-3 3H7a3 3 0 010-6h2", // link
];
export function sigilPathFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SIGILS[h % SIGILS.length];
}

// ── THE TRACE ────────────────────────────────────────────────────────────

export interface TraceGeom {
  fill: string;
  stroke: string;
  /** 0–1 of the window width: the likely value's x. */
  modeX: number;
  /** 0–1 of the window width: where `low` and `high` actually land. */
  x0: number;
  x1: number;
  drawn: boolean;
}

/** Sampled at a fixed count so the path always interpolates cleanly between
    two states — a morph, never a jump cut. */
const N = 24;

export function tracePaths(
  range: ThreePoint,
  hasItems: boolean,
  maxSpread: number,
  w: number,
  h: number
): TraceGeom {
  const spread = Math.max(0, range.high - range.low);
  if (!hasItems || spread === 0 || w <= 0) {
    const y = h - 1.2;
    const line = `M2 ${y} L${w - 2} ${y}`;
    return { fill: `${line} L${w - 2} ${h} L2 ${h} Z`, stroke: line, modeX: 0.5, x0: 0, x1: 1, drawn: false };
  }
  const rel = maxSpread > 0 ? Math.min(1, spread / maxSpread) : 1;
  const extent = 0.4 + 0.58 * rel; // a wider range is drawn wider
  // Unit-area normalisation: the narrower the range, the taller the density.
  // Floored at 0.62 so even the widest capability fills its window — the
  // ordering still reads, and nothing is a smear along the glass floor.
  const peak = 0.96 - 0.34 * rel;
  const mode = (range.likely - range.low) / spread;
  const x0 = ((1 - extent) / 2) * w;
  const cw = extent * w;

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const d = t <= mode ? (mode > 0 ? t / mode : 1) : (1 - t) / (1 - mode || 1);
    // The data is triangular; the rendering carries a mild shoulder so it
    // reads as a contour rather than a wedge.
    const shaped = Math.pow(Math.max(0, d), 0.62);
    pts.push({ x: x0 + t * cw, y: h - 1.2 - shaped * peak * (h - 3) });
  }
  let stroke = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i - 1].x + pts[i].x) / 2;
    const my = (pts[i - 1].y + pts[i].y) / 2;
    stroke += ` Q${pts[i - 1].x.toFixed(1)} ${pts[i - 1].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  stroke += ` T${pts[pts.length - 1].x.toFixed(1)} ${pts[pts.length - 1].y.toFixed(1)}`;
  return {
    fill: `${stroke} L${(x0 + cw).toFixed(1)} ${h} L${x0.toFixed(1)} ${h} Z`,
    stroke,
    modeX: (x0 + mode * cw) / w,
    x0: x0 / w,
    x1: (x0 + cw) / w,
    drawn: true,
  };
}

const SAME = (a: ThreePoint, b: ThreePoint) =>
  Math.abs(a.low - b.low) < 0.05 && Math.abs(a.likely - b.likely) < 0.05 && Math.abs(a.high - b.high) < 0.05;

// ── THE DISPLAY ──────────────────────────────────────────────────────────
//
// Exported because Feature Detail opens the same instrument at a larger size;
// there is one distribution display in Scope, not two that drift.
export function DistributionDisplay({
  range,
  hasItems,
  maxSpread,
  accent,
  ghost,
  dim,
  scale = 1,
  showLikelyLabel = true,
}: {
  range: ThreePoint;
  hasItems: boolean;
  maxSpread: number;
  accent: string;
  /** Reality's range, drawn behind, when a Scenario has moved this one. */
  ghost?: ThreePoint | null;
  /** Powered down: no phosphor, neutral trace. */
  dim?: boolean;
  /** >1 for the detail panel's larger instance. */
  scale?: number;
  showLikelyLabel?: boolean;
}) {
  const g = tracePaths(range, hasItems, maxSpread, 200, 30);
  const ghosted = ghost && hasItems && !SAME(ghost, range) ? tracePaths(ghost, true, maxSpread, 200, 30) : null;

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        borderRadius: 6 * Math.min(1.5, scale),
        // Display glass: a cool near-black with a faint top-down lift, cut
        // into the faceplate rather than laid on it.
        background: "linear-gradient(180deg, #080b0d 0%, #04070a 100%)",
        boxShadow:
          "inset 0 2px 6px rgba(0,0,0,0.62), inset 0 -1px 0 rgba(255,255,255,0.028), inset 0 0 0 1px rgba(255,255,255,0.03)",
      }}
      aria-hidden
    >
      {/* Reference marks — four hairlines and a floor. Enough to read the
          curve against; not an axis, and never a chart grid. */}
      <span className="absolute inset-0 pointer-events-none">
        {[0.25, 0.5, 0.75].map((p) => (
          <span
            key={p}
            className="absolute"
            style={{
              left: `${p * 100}%`,
              top: 4 * scale,
              bottom: 4 * scale,
              width: 1,
              background: "rgba(255,255,255,0.032)",
            }}
          />
        ))}
        <span
          className="absolute left-0 right-0"
          style={{ bottom: 1, height: 1, background: "rgba(255,255,255,0.05)" }}
        />
      </span>

      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 30" preserveAspectRatio="none">
        {/* Reality, where the Scenario has left it. Flat, unlit, behind. */}
        {ghosted && (
          <motion.path
            initial={false}
            animate={{ d: ghosted.stroke }}
            transition={{ type: "spring", stiffness: 150, damping: 26 }}
            fill="none"
            stroke="var(--i-reality)"
            strokeWidth="1"
            strokeDasharray="2.5 2.5"
            opacity={0.5}
          />
        )}
        <motion.path
          initial={false}
          animate={{ d: g.fill }}
          transition={{ type: "spring", stiffness: 150, damping: 26 }}
          fill={dim ? "rgba(255,255,255,0.05)" : `color-mix(in srgb, ${accent} 26%, transparent)`}
        />
        <motion.path
          initial={false}
          animate={{ d: g.stroke }}
          transition={{ type: "spring", stiffness: 150, damping: 26 }}
          fill="none"
          stroke={dim ? "var(--i-reality)" : accent}
          strokeWidth={dim ? 1.1 : 1.4}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          // Phosphor: the trace is the one emissive thing in the window.
          style={dim ? undefined : { filter: `drop-shadow(0 0 ${2.5 * scale}px color-mix(in srgb, ${accent} 55%, transparent))` }}
          opacity={dim ? 0.62 : 0.95}
        />
      </svg>

      {/* The likely locator, carrying its own value like a marker readout. */}
      {g.drawn && (
        <motion.span
          className="absolute pointer-events-none"
          initial={false}
          animate={{ left: `${(g.modeX * 100).toFixed(2)}%` }}
          transition={{ type: "spring", stiffness: 150, damping: 26 }}
          style={{ top: 0, bottom: 0, width: 0 }}
        >
          <span
            className="absolute"
            style={{
              left: 0,
              top: 3 * scale,
              bottom: 0,
              width: 1,
              background: dim
                ? "linear-gradient(180deg, transparent, rgba(255,255,255,0.14))"
                : `linear-gradient(180deg, transparent 8%, color-mix(in srgb, ${accent} 70%, transparent))`,
            }}
          />
          <span
            className="absolute"
            style={{
              left: -2,
              top: 3 * scale,
              width: 5,
              height: 1,
              background: dim ? "rgba(255,255,255,0.2)" : accent,
            }}
          />
          {showLikelyLabel && (
            <span
              className="absolute tabular-nums whitespace-nowrap"
              style={{
                left: g.modeX > 0.62 ? undefined : 5,
                right: g.modeX > 0.62 ? 5 : undefined,
                top: 1.5 * scale,
                fontSize: 8 * Math.min(1.35, scale),
                letterSpacing: "0.02em",
                color: dim ? "var(--i-text-faint)" : `color-mix(in srgb, ${accent} 88%, white)`,
              }}
            >
              {range.likely.toFixed(1)}d
            </span>
          )}
        </motion.span>
      )}

      {/* Vignette — the glass has edges, and light falls off into them. */}
      <span
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: 6 * Math.min(1.5, scale),
          background:
            "radial-gradient(120% 90% at 50% 42%, transparent 42%, rgba(0,0,0,0.34) 88%, rgba(0,0,0,0.5) 100%)",
        }}
      />
    </div>
  );
}

/** The day scale beneath the glass: the numbers sit where the curve reaches,
    so reading the axis and reading the shape are the same act. */
function DayScale({ range, geom, tone }: { range: ThreePoint; geom: TraceGeom; tone: string }) {
  return (
    <div className="relative shrink-0 mt-1 h-[10px]" aria-hidden>
      <span
        className="absolute text-[8px] tabular-nums -translate-x-1/2"
        style={{ left: `${Math.max(6, geom.x0 * 100)}%`, color: tone }}
      >
        {range.low.toFixed(1)}
      </span>
      <span
        className="absolute text-[8px] tabular-nums -translate-x-1/2"
        style={{ left: `${Math.min(94, geom.x1 * 100)}%`, color: tone }}
      >
        {range.high.toFixed(1)}
      </span>
    </div>
  );
}

// ── THE SEAT ─────────────────────────────────────────────────────────────
// `bays` > 1 is a run of adjacent empty positions drawn as ONE recess with its
// mounting divisions still visible — bare chassis, rather than a blank panel.
export function Seat({
  armed,
  tone = "var(--i-text)",
  bays = 1,
  mark,
}: {
  armed?: boolean;
  tone?: string;
  bays?: number;
  /** A bare bay: carries a machined registration mark so an unoccupied
      position reads as part of the chassis, not as an empty card. */
  mark?: boolean;
}) {
  return (
    <>
      <motion.span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        initial={false}
        animate={{
          boxShadow: armed
            ? `inset 0 3px 9px rgba(0,0,0,0.62), inset 0 -1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px color-mix(in srgb, ${tone} 36%, transparent), 0 0 18px color-mix(in srgb, ${tone} 12%, transparent)`
            : "inset 0 3px 9px rgba(0,0,0,0.62), inset 0 -1px 0 rgba(255,255,255,0.045)",
        }}
        transition={{ duration: 0.22 }}
        style={{ borderRadius: 12, background: "var(--i-recess)" }}
      />
      {mark && (
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 pointer-events-none"
          style={{ width: 13, height: 13, marginLeft: -6.5, marginTop: -6.5 }}
        >
          <span className="absolute left-1/2 top-0 bottom-0" style={{ width: 1, marginLeft: -0.5, background: "rgba(255,255,255,0.075)" }} />
          <span className="absolute top-1/2 left-0 right-0" style={{ height: 1, marginTop: -0.5, background: "rgba(255,255,255,0.075)" }} />
          <span
            className="absolute inset-[3px] rounded-full"
            style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)" }}
          />
        </span>
      )}
      {bays > 1 &&
        Array.from({ length: bays - 1 }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              left: `${((i + 1) * 100) / bays}%`,
              top: 14,
              bottom: 14,
              width: 1,
              background:
                "linear-gradient(180deg, transparent, rgba(255,255,255,0.055) 22%, rgba(255,255,255,0.055) 78%, transparent)",
            }}
          />
        ))}
    </>
  );
}

// ── THE MODULE ───────────────────────────────────────────────────────────

export default function CapabilityTile({
  feature,
  share,
  material,
  maxSpread,
  ghostRange,
  lifted,
  compact,
  onOpen,
  dragHandleProps,
  setNodeRef,
}: {
  feature: Feature;
  /** 0-1 of the release's load. */
  share: number;
  material: Material;
  /** Widest effort-day spread across the release — the display's yardstick. */
  maxSpread: number;
  /** Reality's range, when a Scenario re-estimate has moved this capability. */
  ghostRange?: ThreePoint | null;
  lifted?: boolean;
  /** Cassette form: shorter, powered down. */
  compact?: boolean;
  onOpen?: () => void;
  dragHandleProps?: Record<string, unknown>;
  setNodeRef?: (el: HTMLElement | null) => void;
}) {
  const f = feature;
  const out = material === "out";
  const spectral = material === "spectral";
  const raw = material === "raw";
  const accent = accentFor(material);
  const hasRange = f.items.length > 0 && f.range.high - f.range.low > 0;
  const geom = tracePaths(f.range, f.items.length > 0, maxSpread, 200, 30);
  const mapped = f.items.length + f.done.length;
  const dotTotal = Math.min(6, mapped);
  const dotDone = mapped > 0 ? Math.round((f.done.length / mapped) * dotTotal) : 0;
  const restY = spectral && !lifted ? -7 : 0;

  // ── FACE MATERIAL ─────────────────────────────────────────────────────
  // Graphite in every state. The accent lives in the edge, the sigil and the
  // trace — never as a wash over the whole module.
  const face = out
    ? "linear-gradient(180deg, #12171a 0%, #0d1114 100%)"
    : raw
      ? "linear-gradient(180deg, #16150f 0%, #0f0f0c 100%)"
      : spectral
        ? "linear-gradient(180deg, rgba(31,29,46,0.86) 0%, rgba(18,18,28,0.82) 100%)"
        : "linear-gradient(180deg, #1b2226 0%, #141a1e 52%, #10161a 100%)";

  const edge = out
    ? "#1e2529"
    : raw
      ? "color-mix(in srgb, var(--i-amber) 17%, #1e2226)"
      : spectral
        ? "color-mix(in srgb, var(--i-violet) 58%, transparent)"
        : "#2b353b";

  return (
    <motion.div
      ref={setNodeRef as never}
      initial={false}
      animate={lifted ? "lift" : "rest"}
      whileHover={lifted || !onOpen ? undefined : "hover"}
      whileTap={lifted || !onOpen ? undefined : "press"}
      variants={{
        rest: { y: restY, scale: 1, transition: { type: "spring", stiffness: 420, damping: 36, mass: 0.7 } },
        // The module answers before it moves: the edge wakes on its own
        // faster timing (see the specular child), the body follows.
        hover: {
          y: restY - 3,
          scale: 1,
          transition: { type: "spring", stiffness: 380, damping: 34, mass: 0.7 },
        },
        // Pushed into its seat — short, damped, no travel back through zero.
        press: { y: restY + 1.5, scale: 0.996, transition: { type: "spring", stiffness: 900, damping: 42 } },
        lift: { y: 0, scale: 1, transition: { type: "spring", stiffness: 420, damping: 36 } },
      }}
      className="absolute inset-0"
      style={{
        borderRadius: 12,
        cursor: onOpen ? "grab" : undefined,
        background: face,
        // A candidate is not resting on anything: you can see the recess
        // through it. This is what makes it unmistakable without the word.
        backdropFilter: spectral ? "blur(1.5px)" : undefined,
        border: `1px ${spectral ? "dashed" : "solid"} ${edge}`,
        boxShadow: lifted
          ? // Off the deck: cast shadow separates, face catches more light.
            `0 30px 60px rgba(0,0,0,0.66), 0 8px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.11), 0 0 34px color-mix(in srgb, ${accent} 20%, transparent)`
          : out
            ? // Powered down: it sits, but nothing is lit inside it.
              "0 1px 2px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.028)"
            : spectral
              ? // Hovering: a gap of shadow beneath, no contact edge.
                "0 14px 26px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.05)"
              : // Seated: hard contact with the deck, and a real top facet.
                "0 2px 3px rgba(0,0,0,0.55), 0 1px 0 rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.075)",
      }}
      data-shoot="capability"
      data-material={material}
      data-capability={f.id}
    >
      {/* THE SPECULAR EDGE — the top facet catching the room's light, and the
          module's identity colour. It is the first thing to answer a pointer. */}
      {!out && !raw && (
        <motion.span
          aria-hidden
          className="absolute pointer-events-none"
          initial={false}
          variants={{
            rest: { opacity: 0.42, transition: { duration: 0.22 } },
            hover: { opacity: 1, transition: { duration: 0.12, ease: "easeOut" } },
            press: { opacity: 0.8, transition: { duration: 0.08 } },
            lift: { opacity: 1, transition: { duration: 0.14 } },
          }}
          style={{
            left: 11,
            right: 11,
            top: -0.5,
            height: 1,
            borderRadius: 1,
            background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${accent} 85%, white) 32%, color-mix(in srgb, ${accent} 85%, white) 68%, transparent)`,
            boxShadow: `0 0 6px color-mix(in srgb, ${accent} 45%, transparent)`,
          }}
        />
      )}
      {/* Parked: the conductor is visibly cut, rather than merely faded. */}
      {out && (
        <span
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            left: 11,
            right: 11,
            top: -0.5,
            height: 1,
            background:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.16) 0 3px, transparent 3px 8px)",
          }}
        />
      )}

      {spectral && !lifted && (
        <motion.span
          aria-hidden
          className="absolute left-[12%] right-[12%] pointer-events-none"
          animate={{ opacity: [0.65, 0.42, 0.65], scaleX: [1, 0.95, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          style={{
            bottom: -11,
            height: 10,
            borderRadius: "50%",
            background: "radial-gradient(closest-side, rgba(0,0,0,0.7), transparent)",
            filter: "blur(3px)",
          }}
        />
      )}

      <button
        type="button"
        onClick={onOpen}
        {...dragHandleProps}
        className={`absolute inset-0 flex flex-col text-left ${compact ? "px-3 pt-2.5 pb-2" : "px-3.5 pt-3 pb-2.5"}`}
        style={{ cursor: "inherit", touchAction: "none", borderRadius: 12, overflow: "hidden" }}
        aria-label={`${f.name}, ${f.loadDays.toFixed(1)} days of load${out ? ", out of this release" : ""}. Drag to move, or click to open.`}
      >
        {raw && <span aria-hidden className="absolute inset-0 i-hatch" style={{ opacity: 0.4 }} />}

        {/* Faceplate: sigil plate + name */}
        <div className="relative flex items-center gap-2">
          <span
            aria-hidden
            className="flex items-center justify-center shrink-0"
            style={{
              width: compact ? 22 : 28,
              height: compact ? 22 : 28,
              borderRadius: 7,
              color: out ? "var(--i-text-faint)" : accent,
              background: out ? "rgba(255,255,255,0.02)" : `color-mix(in srgb, ${accent} 11%, transparent)`,
              border: `1px solid ${out ? "#242b30" : `color-mix(in srgb, ${accent} 26%, transparent)`}`,
              boxShadow: out ? undefined : `inset 0 1px 0 rgba(255,255,255,0.05)`,
            }}
          >
            <svg width={compact ? 12 : 14} height={compact ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
              <path d={sigilPathFor(f.name)} />
            </svg>
          </span>
          <span
            className="min-w-0 font-semibold uppercase leading-[1.25]"
            style={{
              fontSize: compact ? 9.5 : 11.5,
              letterSpacing: "0.07em",
              color: out ? "var(--i-text-soft)" : "var(--i-text)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {f.name}
          </span>
        </div>

        {(classLabel(f) || raw || out) && (
          <div className="relative mt-1 flex items-center gap-1.5" style={{ minHeight: 12 }}>
            {classLabel(f) && (
              <span
                className="rounded-sm px-1 py-px text-[8px] font-semibold uppercase tracking-[0.09em]"
                style={{ color: accent, border: `1px solid color-mix(in srgb, ${accent} 50%, transparent)` }}
              >
                {classLabel(f)}
              </span>
            )}
            {raw && (
              <span className="text-[8px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--i-amber)", opacity: 0.8 }}>
                unassigned work
              </span>
            )}
            {out && (
              <span className="text-[8px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--i-text-faint)" }}>
                not in this release
              </span>
            )}
          </div>
        )}

        <div className={`relative flex items-baseline gap-2 ${compact ? "mt-1" : "mt-1.5"}`}>
          <span
            className="i-readout leading-none"
            style={{ fontSize: compact ? 15 : 22, color: out ? "var(--i-text-soft)" : "var(--i-text)" }}
          >
            {f.loadDays.toFixed(1)}
            <span className="text-[10px] font-normal">d</span>
          </span>
          <span className="text-[9.5px] text-[var(--i-text-faint)]">
            {out ? "not carried" : `${(share * 100).toFixed(0)}% of load`}
          </span>
        </div>

        {/* THE DISPLAY — cut into the faceplate, filling the module's body. */}
        <div className={`relative flex-1 min-h-0 flex flex-col justify-end ${compact ? "mt-1.5" : "mt-2"}`}>
          <div className="relative flex-1 min-h-[30px]" style={compact ? { maxHeight: 62 } : undefined}>
            <DistributionDisplay
              range={f.range}
              hasItems={f.items.length > 0}
              maxSpread={maxSpread}
              accent={accent}
              ghost={ghostRange}
              dim={out}
              showLikelyLabel={!compact}
            />
          </div>
          {hasRange && !compact && (
            <DayScale range={f.range} geom={geom} tone="var(--i-text-faint)" />
          )}
        </div>

        {!compact && (
          <div className="relative mt-1 shrink-0 flex items-center justify-between text-[9px] text-[var(--i-text-faint)]">
            <span>
              {f.items.length === 0 && f.done.length === 0
                ? "no work mapped"
                : `uncertainty ${uncertaintyLabel(f.uncertainty).toLowerCase()}`}
            </span>
            <span className="flex items-center gap-[3px]" aria-label={mapped > 0 ? `${f.done.length} of ${mapped} done` : undefined}>
              {Array.from({ length: dotTotal }).map((_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="rounded-full"
                  style={{
                    width: 4,
                    height: 4,
                    background: i < dotDone ? (out ? "var(--i-reality)" : accent) : "rgba(255,255,255,0.13)",
                  }}
                />
              ))}
            </span>
          </div>
        )}
      </button>
    </motion.div>
  );
}
