"use client";

// A CAPABILITY, AS A PHYSICAL OBJECT.
//
// Three material classes, because Scope holds three genuinely different kinds
// of thing and they should be distinguishable before any label is read:
//
//   SEATED    accepted Reality. Sits IN the tray: solid, lit from within, with
//             a contact shadow underneath. It is touching the surface.
//   SPECTRAL  a Hermes candidate or an unsaved draft. Hovers a few pixels
//             ABOVE the tray, translucent, dashed edge, no contact shadow, and
//             breathing very slightly. Its work is already counted -- what is
//             unsettled is whether it is a capability -- so it belongs in the
//             bay while visibly not being seated in it.
//   RAW       unmapped work. Uncut material: hatched, notched, and deliberately
//             not tile-shaped enough to be mistaken for a finished capability.
//
// Size carries relative load in three discrete steps rather than continuously.
// A tile that resizes by a few pixels every time an estimate moves is a chart;
// three sizes is a hierarchy you can learn and recognise across sessions.

import { motion } from "motion/react";
import { uncertaintyLabel, type Feature } from "@/lib/scope/features";

export type Material = "seated" | "spectral" | "raw" | "out";

export function materialOf(f: Feature): Material {
  if (f.bypassed) return "out";
  if (f.source === "unmapped") return "raw";
  // Seating a candidate is the whole point of accepting it: it stops hovering
  // and comes to rest on the tray like everything else in Reality.
  if ((f.source === "hermes" || f.source === "manual") && !f.accepted) return "spectral";
  return "seated";
}

/** Three steps, from share of the release. Thresholds are stated once here. */
export function tileWidth(share: number): number {
  if (share >= 0.24) return 268;
  if (share >= 0.11) return 204;
  return 156;
}

export const TILE_H = 148;

function classLabel(f: Feature): string | null {
  if (f.source === "linear" || f.source === "unmapped") return null;
  if (f.accepted) return f.source === "hermes" ? "Accepted" : "Draft · seated";
  return f.source === "hermes" ? "Candidate" : "Draft";
}

export default function CapabilityTile({
  feature,
  share,
  material,
  lifted,
  onOpen,
  dragHandleProps,
  setNodeRef,
}: {
  feature: Feature;
  /** 0-1 of the release's load. Drives width and the level bar. */
  share: number;
  material: Material;
  /** True while this tile is the one in the hand (rendered in the overlay). */
  lifted?: boolean;
  onOpen?: () => void;
  dragHandleProps?: Record<string, unknown>;
  setNodeRef?: (el: HTMLElement | null) => void;
}) {
  const f = feature;
  const w = tileWidth(share);
  const out = material === "out";
  const spectral = material === "spectral";
  const raw = material === "raw";

  const accent = raw ? "var(--i-amber)" : spectral ? "var(--i-violet)" : "var(--i-text)";
  // Certainty softens the halo rather than printing a number: a capability
  // nobody has really sized reads as blurred at its edges.
  const halo = f.items.length === 0 ? 0 : Math.min(26, 8 + f.uncertainty * 12);

  return (
    <motion.div
      ref={setNodeRef as never}
      layout={!lifted}
      layoutId={lifted ? undefined : `cap-${f.id}`}
      initial={false}
      // Seated things rest on the surface; spectral things hang just off it.
      // The float is a STATIC offset, not a loop. An element that never comes
      // to rest is never "stable" -- it blocks pointer actionability, defeats
      // assistive tooling and composites forever. The life goes into the
      // shadow below instead, which nothing needs to interact with.
      animate={{ y: spectral && !lifted ? -11 : 0, opacity: out ? 0.62 : spectral ? 0.94 : 1 }}
      whileHover={lifted ? undefined : { y: spectral ? -16 : -4 }}
      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
      style={{
        width: w,
        height: TILE_H,
        borderRadius: 10,
        cursor: onOpen ? "grab" : undefined,
        position: "relative",
        background: raw
          ? "var(--i-bg)"
          : out
            ? "var(--i-bg)"
            : spectral
              ? "color-mix(in srgb, var(--i-violet) 7%, var(--i-panel))"
              : "linear-gradient(180deg, var(--i-panel-raised) 0%, var(--i-panel) 100%)",
        border: `1px ${spectral || raw ? "dashed" : "solid"} ${
          out ? "var(--i-border)" : raw ? "color-mix(in srgb, var(--i-amber) 55%, transparent)" : spectral ? "var(--i-violet)" : "var(--i-border-strong)"
        }`,
        // The contact shadow is the whole tell: seated tiles have one, spectral
        // ones do not, and a lifted tile trades it for a cast shadow.
        boxShadow: lifted
          ? "0 28px 60px rgba(0,0,0,0.62), 0 2px 0 rgba(255,255,255,0.07) inset"
          : out
            ? "none"
            : spectral
              ? `0 10px 26px rgba(0,0,0,0.34), 0 0 ${halo}px color-mix(in srgb, var(--i-violet) 22%, transparent)`
              : `0 2px 0 rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.05) inset, 0 0 ${halo}px color-mix(in srgb, ${accent} 7%, transparent)`,
      }}
      data-shoot="capability"
      data-material={material}
      data-capability={f.id}
    >
      {/* The proof it is not touching the tray: a cast shadow with a gap. */}
      {spectral && !lifted && (
        <motion.span
          aria-hidden
          className="absolute left-[8%] right-[8%] pointer-events-none"
          animate={{ opacity: [0.85, 0.6, 0.85], scaleX: [1, 0.94, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{
            bottom: -16,
            height: 16,
            borderRadius: "50%",
            background: "radial-gradient(closest-side, rgba(0,0,0,0.66), transparent)",
            filter: "blur(3px)",
          }}
        />
      )}
      <button
        type="button"
        onClick={onOpen}
        {...dragHandleProps}
        className="absolute inset-0 flex flex-col text-left px-3.5 py-3"
        style={{ cursor: "inherit", touchAction: "none" }}
        aria-label={`${f.name}, ${f.loadDays.toFixed(1)} days of load${out ? ", out of this release" : ""}. Drag to move, or click to open.`}
      >
        {raw && <span aria-hidden className="absolute inset-0 i-hatch" style={{ borderRadius: 9, opacity: 0.55 }} />}

        <div className="relative flex items-center gap-1.5">
          {classLabel(f) && (
            <span
              className="rounded-sm px-1 py-px text-[8px] font-semibold uppercase tracking-[0.09em]"
              style={{ color: accent, border: `1px solid ${accent}`, opacity: 0.72 }}
            >
              {classLabel(f)}
            </span>
          )}
          {out && (
            <span className="text-[8px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--i-violet)" }}>
              out
            </span>
          )}
        </div>

        <div
          className="relative mt-1.5 font-medium leading-[1.22]"
          style={{
            fontSize: w >= 268 ? 15.5 : 13.5,
            color: out ? "var(--i-text-faint)" : raw ? "var(--i-text-soft)" : "var(--i-text)",
          }}
        >
          {f.name}
        </div>

        <div className="flex-1" />

        <div className="relative flex items-baseline gap-2">
          <span
            className="i-readout leading-none"
            style={{ fontSize: w >= 268 ? 21 : 18, color: out ? "var(--i-text-faint)" : "var(--i-text)" }}
          >
            {f.loadDays.toFixed(1)}
            <span className="text-[10px] font-normal">d</span>
          </span>
          <span className="text-[9.5px] text-[var(--i-text-faint)]">
            {out ? "not in the release" : `${(share * 100).toFixed(0)}% of the release`}
          </span>
        </div>

        <div className="relative mt-1 flex items-baseline justify-between text-[9px] text-[var(--i-text-faint)]">
          <span>
            {f.items.length === 0 && f.done.length === 0
              ? "no work mapped"
              : `${f.items.length} open${f.done.length > 0 ? ` · ${f.done.length} done` : ""}`}
          </span>
          <span>{f.items.length > 0 ? uncertaintyLabel(f.uncertainty).toLowerCase() : "—"}</span>
        </div>

        {/* The level: this capability's share of the release, along the tile's
            own bottom edge. A weight, not a chart. */}
        <div className="relative mt-2 h-[2px] rounded-full overflow-hidden" style={{ background: "var(--i-recess)" }}>
          <motion.div
            className="h-full"
            initial={false}
            animate={{ width: out ? "0%" : `${Math.min(100, share * 100 * 2.6)}%` }}
            transition={{ type: "spring", stiffness: 260, damping: 32 }}
            style={{ background: accent, opacity: out ? 0 : raw ? 0.55 : 0.75 }}
          />
        </div>
      </button>
    </motion.div>
  );
}

/** The depression a lifted tile leaves behind. Same footprint, so the bay does
    not collapse under the hand -- the composition stays spatially continuous. */
export function TileSlot({ width }: { width: number }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
      style={{
        width,
        height: TILE_H,
        borderRadius: 10,
        background: "var(--i-recess)",
        border: "1px dashed var(--i-border)",
        boxShadow: "0 3px 10px rgba(0,0,0,0.5) inset",
      }}
      aria-hidden
    />
  );
}
