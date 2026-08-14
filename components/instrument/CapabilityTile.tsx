"use client";

// A CAPABILITY MODULE — the instrument unit of the Scope Composer.
//
// Visual contract (from the accepted reference mockup, mapped to real data):
//
//   sigil        a deterministic identity glyph, hashed from the name — an
//                anchor for the eye, carrying no invented semantics
//   name         the capability, set in caps like a module faceplate
//   load         expected days of schedule, the module's hero number
//   trace        a small distribution: the triangular density of the summed
//                three-point range. Horizontal extent = spread relative to
//                the release's widest; peak height = concentration; the
//                peak's position = (likely − low) / (high − low). It morphs
//                when estimates or capacity change, because it is derived.
//   dots         progress: done work over total mapped work (capped at 6)
//   accent hue   CERTAINTY, and nothing else — teal = well-sized, blue =
//                moderate, indigo = poorly sized. Candidates are violet and
//                physically unseated; unmapped work is amber and raw.
//
// The SEAT (empty recess / offered recess) remains the drag vocabulary from
// the material pass — occupied, vacated, offered are one object in three
// states.

import { motion } from "motion/react";
import { uncertaintyLabel, type Feature } from "@/lib/scope/features";

export type Material = "seated" | "spectral" | "raw" | "out";

export function materialOf(f: Feature): Material {
  if (f.bypassed) return "out";
  if (f.source === "unmapped") return "raw";
  if ((f.source === "hermes" || f.source === "manual") && !f.accepted) return "spectral";
  return "seated";
}

export const MODULE_H = 214;

// Certainty hues. These are the only per-module colors on the surface, and
// they mean exactly one thing: how well this capability is sized.
const HUE = {
  low: "#41d6c3", // Low uncertainty — settled
  moderate: "#5b9bff", // Moderate
  high: "#8f7bff", // High uncertainty — poorly sized
} as const;

export function accentFor(f: Feature, material: Material): string {
  if (material === "raw") return "var(--i-amber)";
  if (material === "spectral") return "var(--i-violet)";
  const u = uncertaintyLabel(f.uncertainty);
  return u === "Low" ? HUE.low : u === "Moderate" ? HUE.moderate : HUE.high;
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
function sigilFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SIGILS[h % SIGILS.length];
}

// ── THE TRACE ────────────────────────────────────────────────────────────
// Triangular density of the summed three-point range, sampled at a fixed 24
// points so the path always animates cleanly between states.
const N = 24;
export function tracePaths(
  f: Feature,
  maxSpread: number,
  w: number,
  h: number
): { fill: string; stroke: string; modeX: number } {
  const spread = Math.max(0, f.range.high - f.range.low);
  if (f.items.length === 0 || spread === 0 || w <= 0) {
    const y = h - 2;
    const line = `M2 ${y} L${w - 2} ${y}`;
    return { fill: `${line} L${w - 2} ${h} L2 ${h} Z`, stroke: line, modeX: 0.5 };
  }
  const rel = maxSpread > 0 ? Math.min(1, spread / maxSpread) : 1;
  const extent = 0.38 + 0.6 * rel; // wide range -> wide curve
  const peak = 0.95 - 0.5 * rel; // concentrated -> tall
  const mode = (f.range.likely - f.range.low) / spread;
  const x0 = ((1 - extent) / 2) * w;
  const cw = extent * w;

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const d = t <= mode ? (mode > 0 ? t / mode : 1) : (1 - t) / (1 - mode || 1);
    // A mild shoulder on the triangular density: the data is triangular, the
    // rendering is smoothed so it reads as a contour rather than a wedge.
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
  };
}

// ── THE SEAT ─────────────────────────────────────────────────────────────
// `bays` > 1 is a run of adjacent empty positions drawn as ONE recess with its
// mounting divisions still visible — bare chassis, rather than a blank panel.
export function Seat({
  armed,
  tone = "var(--i-text)",
  bays = 1,
}: {
  armed?: boolean;
  tone?: string;
  bays?: number;
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
  /** Widest effort-day spread across the release — the trace's yardstick. */
  maxSpread: number;
  lifted?: boolean;
  /** Out-column form: shorter, quieter. */
  compact?: boolean;
  onOpen?: () => void;
  dragHandleProps?: Record<string, unknown>;
  setNodeRef?: (el: HTMLElement | null) => void;
}) {
  const f = feature;
  const out = material === "out";
  const spectral = material === "spectral";
  const raw = material === "raw";
  const accent = accentFor(f, material);
  const { fill, stroke, modeX } = tracePaths(f, maxSpread, 200, 30);
  const hasRange = f.items.length > 0 && f.range.high - f.range.low > 0;
  const mapped = f.items.length + f.done.length;
  const dotTotal = Math.min(6, mapped);
  const dotDone = mapped > 0 ? Math.round((f.done.length / mapped) * dotTotal) : 0;

  return (
    <motion.div
      ref={setNodeRef as never}
      initial={false}
      animate={{ y: spectral && !lifted ? -7 : 0, opacity: out && !lifted ? 0.66 : spectral ? 0.96 : 1 }}
      whileHover={lifted || !onOpen ? undefined : { y: spectral ? -11 : -3 }}
      whileTap={lifted || !onOpen ? undefined : { y: spectral ? -5 : 1.5, scale: 0.995 }}
      transition={{ type: "spring", stiffness: 430, damping: 34, mass: 0.7 }}
      className="absolute inset-0"
      style={{
        borderRadius: 12,
        cursor: onOpen ? "grab" : undefined,
        background: raw
          ? "color-mix(in srgb, var(--i-amber) 3%, #0e1215)"
          : out
            ? "#0d1013"
            : `linear-gradient(160deg, color-mix(in srgb, ${accent} 17%, #182026) 0%, color-mix(in srgb, ${accent} 7%, #121a1f) 46%, #0d1216 100%)`,
        border: `1px ${spectral ? "dashed" : "solid"} ${
          out
            ? "var(--i-border)"
            : raw
              ? "color-mix(in srgb, var(--i-amber) 32%, var(--i-border))"
              : `color-mix(in srgb, ${accent} ${spectral ? 70 : 42}%, transparent)`
        }`,
        boxShadow: lifted
          ? `0 26px 54px rgba(0,0,0,0.62), 0 6px 16px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset, 0 0 26px color-mix(in srgb, ${accent} 16%, transparent)`
          : out
            ? "0 1px 0 rgba(0,0,0,0.4)"
            : spectral
              ? `0 12px 24px rgba(0,0,0,0.3), 0 0 22px color-mix(in srgb, var(--i-violet) 18%, transparent)`
              : `0 2px 3px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.07) inset, 0 0 ${12 + share * 34}px color-mix(in srgb, ${accent} 17%, transparent)`,
      }}
      data-shoot="capability"
      data-material={material}
      data-capability={f.id}
    >
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
        className="absolute inset-0 flex flex-col text-left px-3.5 pt-3 pb-2.5"
        style={{ cursor: "inherit", touchAction: "none", borderRadius: 12, overflow: "hidden" }}
        aria-label={`${f.name}, ${f.loadDays.toFixed(1)} days of load${out ? ", out of this release" : ""}. Drag to move, or click to open.`}
      >
        {raw && <span aria-hidden className="absolute inset-0 i-hatch" style={{ opacity: 0.42 }} />}

        {/* Faceplate row: sigil plate + class tag */}
        <div className="relative flex items-center gap-2">
          <span
            aria-hidden
            className="flex items-center justify-center shrink-0"
            style={{
              width: compact ? 24 : 30,
              height: compact ? 24 : 30,
              borderRadius: 8,
              color: accent,
              background: `color-mix(in srgb, ${accent} ${out ? 6 : 13}%, transparent)`,
              border: `1px solid color-mix(in srgb, ${accent} ${out ? 18 : 30}%, transparent)`,
            }}
          >
            <svg width={compact ? 13 : 15} height={compact ? 13 : 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
              <path d={sigilFor(f.name)} />
            </svg>
          </span>
          <span
            className="min-w-0 font-semibold uppercase leading-[1.25]"
            style={{
              fontSize: compact ? 10 : 11.5,
              letterSpacing: "0.07em",
              color: out ? "var(--i-text-faint)" : "var(--i-text)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {f.name}
          </span>
        </div>

        <div className="relative mt-1 flex items-center gap-1.5" style={{ minHeight: 13 }}>
          {classLabel(f) && (
            <span
              className="rounded-sm px-1 py-px text-[8px] font-semibold uppercase tracking-[0.09em]"
              style={{ color: accent, border: `1px solid color-mix(in srgb, ${accent} 55%, transparent)`, opacity: 0.85 }}
            >
              {classLabel(f)}
            </span>
          )}
          {raw && (
            <span className="text-[8px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--i-amber)", opacity: 0.75 }}>
              unassigned work
            </span>
          )}
          {out && (
            <span className="text-[8px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--i-violet)" }}>
              out of this release
            </span>
          )}
        </div>

        <div className="relative mt-1.5 flex items-baseline gap-2">
          <span
            className="i-readout leading-none"
            style={{ fontSize: compact ? 17 : 22, color: out ? "var(--i-text-soft)" : "var(--i-text)" }}
          >
            {f.loadDays.toFixed(1)}
            <span className="text-[10px] font-normal">d</span>
          </span>
          <span className="text-[9.5px] text-[var(--i-text-faint)]">
            {out ? "not carried" : `${(share * 100).toFixed(0)}% of load`}
          </span>
        </div>

        {/* THE TRACE — a window cut into the faceplate, filling the module's
            body. The density is derived; the scale beneath it is the actual
            three-point range in days, so the curve is readable, not decorative. */}
        <div className="relative flex-1 min-h-0 mt-2 flex flex-col">
          <div
            className="relative flex-1 min-h-[34px] overflow-hidden"
            style={{
              borderRadius: 6,
              background: out ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0.34)",
              boxShadow: `inset 0 2px 5px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.032)`,
            }}
            aria-hidden
          >
            <svg className="absolute inset-0 w-full h-full i-breath" viewBox="0 0 200 30" preserveAspectRatio="none">
              <motion.path
                initial={false}
                animate={{ d: fill }}
                transition={{ type: "spring", stiffness: 120, damping: 24 }}
                fill={`color-mix(in srgb, ${accent} ${out ? 8 : 26}%, transparent)`}
              />
              <motion.path
                initial={false}
                animate={{ d: stroke }}
                transition={{ type: "spring", stiffness: 120, damping: 24 }}
                fill="none"
                stroke={out ? "var(--i-text-faint)" : accent}
                strokeWidth="1.4"
                strokeLinejoin="round"
                opacity={out ? 0.4 : 0.9}
              />
            </svg>
            {hasRange && (
              <motion.span
                className="absolute pointer-events-none"
                initial={false}
                animate={{ left: `${(modeX * 100).toFixed(2)}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 24 }}
                style={{
                  top: 3,
                  bottom: 0,
                  width: 1,
                  background: `linear-gradient(180deg, transparent, color-mix(in srgb, ${accent} ${out ? 26 : 62}%, transparent))`,
                }}
              />
            )}
          </div>
          {hasRange && !compact && (
            <div
              className="relative shrink-0 mt-1 flex items-center justify-between text-[8px] tabular-nums"
              style={{ color: "var(--i-text-faint)" }}
              aria-hidden
            >
              <span>{f.range.low.toFixed(1)}</span>
              <span style={{ color: out ? "var(--i-text-faint)" : `color-mix(in srgb, ${accent} 72%, var(--i-text-faint))` }}>
                {f.range.likely.toFixed(1)}d likely
              </span>
              <span>{f.range.high.toFixed(1)}</span>
            </div>
          )}
        </div>

        <div className="relative mt-1.5 shrink-0 flex items-center justify-between text-[9px] text-[var(--i-text-faint)]">
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
                  background: i < dotDone ? accent : "rgba(255,255,255,0.14)",
                  boxShadow: i < dotDone ? `0 0 5px color-mix(in srgb, ${accent} 55%, transparent)` : undefined,
                }}
              />
            ))}
          </span>
        </div>
      </button>
    </motion.div>
  );
}
