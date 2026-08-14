"use client";

// A CAPABILITY, AS A PHYSICAL OBJECT — and the SEAT it occupies.
//
// The seat is the unifying physical element of the whole instrument. Every
// capability sits in a machined recess in the chassis. Lift a tile and its
// empty seat stays behind; a candidate hovers ABOVE its still-empty seat; an
// insertion point is nothing more than a new seat opening between modules.
// One vocabulary — occupied, empty, offered — instead of three different
// web affordances (card, placeholder, dropzone).
//
// Three material classes, distinguishable before any label is read:
//
//   SEATED    accepted Reality. Bedded into its recess: solid, faint inner
//             light, contact shadow. It is touching the instrument.
//   SPECTRAL  a Hermes candidate or an unsaved draft. Hovers above an empty
//             seat, translucent, with a soft cast shadow falling into the
//             recess below it. Its work is already counted; its existence as
//             a capability is not settled — so it is present but not bedded.
//   RAW       unmapped work. Uncut stock: hatched, matte, sitting in a seat
//             because it is real, but visibly not yet machined into a module.
//
// Size carries relative load in three discrete steps rather than
// continuously. A tile that resizes by a few pixels every time an estimate
// moves is a chart; three sizes is a hierarchy you can learn.

import { motion } from "motion/react";
import { uncertaintyLabel, type Feature } from "@/lib/scope/features";

export type Material = "seated" | "spectral" | "raw" | "out";

export function materialOf(f: Feature): Material {
  if (f.bypassed) return "out";
  if (f.source === "unmapped") return "raw";
  // Seating a candidate is the whole point of accepting it: it stops
  // hovering and comes to rest on the instrument like everything else.
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

// ── THE SEAT ─────────────────────────────────────────────────────────────
//
// A recess cut into the chassis. It never changes size to mean anything —
// meaning lives in whether it is occupied, empty, or offered (armed). The
// rim highlight along its bottom edge is what makes it read as CUT IN rather
// than drawn on: light catches the far lip of a real recess.
export function Seat({
  armed,
  tone = "var(--i-text)",
}: {
  /** An offered seat under an approaching module: the rim wakes. */
  armed?: boolean;
  tone?: string;
}) {
  return (
    <motion.span
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      initial={false}
      animate={{
        boxShadow: armed
          ? `inset 0 3px 9px rgba(0,0,0,0.62), inset 0 -1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px color-mix(in srgb, ${tone} 34%, transparent), 0 0 18px color-mix(in srgb, ${tone} 12%, transparent)`
          : "inset 0 3px 9px rgba(0,0,0,0.62), inset 0 -1px 0 rgba(255,255,255,0.045)",
      }}
      transition={{ duration: 0.24 }}
      style={{ borderRadius: 11, background: "var(--i-recess)" }}
    />
  );
}

// ── THE TILE ─────────────────────────────────────────────────────────────

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
  /** 0-1 of the release's load. Drives width step and the level bar. */
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
  // nobody has really sized reads as slightly blurred at its edges.
  const halo = f.items.length === 0 ? 0 : Math.min(24, 7 + f.uncertainty * 11);

  return (
    <motion.div
      ref={setNodeRef as never}
      initial={false}
      // Spectral hangs above its seat as a STATIC offset, not a loop — an
      // element that never comes to rest is never "stable": it blocks pointer
      // actionability and composites forever. The breath lives in the cast
      // shadow below, which nothing needs to interact with.
      animate={{ y: spectral && !lifted ? -10 : 0, opacity: out ? 0.6 : spectral ? 0.95 : 1 }}
      whileHover={lifted || !onOpen ? undefined : { y: spectral ? -14 : -3 }}
      // The press: before any movement, the tile beds INTO its seat — contact
      // deepens first, then the lift. This is the first frame of "unseating".
      whileTap={lifted || !onOpen ? undefined : { y: spectral ? -8 : 1.5, scale: 0.995 }}
      transition={{ type: "spring", stiffness: 430, damping: 34, mass: 0.7 }}
      className="absolute inset-0"
      style={{
        borderRadius: 10,
        cursor: onOpen ? "grab" : undefined,
        background: raw
          ? "color-mix(in srgb, var(--i-amber) 3%, var(--i-bg))"
          : out
            ? "var(--i-bg)"
            : spectral
              ? "color-mix(in srgb, var(--i-violet) 8%, var(--i-panel))"
              : "linear-gradient(180deg, var(--i-panel-raised) 0%, var(--i-panel) 100%)",
        border: `1px ${spectral ? "dashed" : "solid"} ${
          out
            ? "var(--i-border)"
            : raw
              ? "color-mix(in srgb, var(--i-amber) 30%, var(--i-border))"
              : spectral
                ? "color-mix(in srgb, var(--i-violet) 75%, transparent)"
                : "var(--i-border-strong)"
        }`,
        // The contact story: seated tiles carry a tight contact shadow and an
        // upper inner light (bedded in, lit from above). A lifted tile trades
        // both for one deep cast shadow. Spectral has no contact at all.
        boxShadow: lifted
          ? "0 26px 54px rgba(0,0,0,0.6), 0 6px 16px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset"
          : out
            ? "0 1px 0 rgba(0,0,0,0.4)"
            : spectral
              ? `0 12px 24px rgba(0,0,0,0.3), 0 0 ${halo}px color-mix(in srgb, var(--i-violet) 20%, transparent)`
              : `0 2px 3px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 ${halo}px color-mix(in srgb, ${accent} 6%, transparent)`,
      }}
      data-shoot="capability"
      data-material={material}
      data-capability={f.id}
    >
      {/* The breath of an unsettled thing: its shadow, cast into the empty
          seat below. Slow, sub-perceptual, and outside the hit target. */}
      {spectral && !lifted && (
        <motion.span
          aria-hidden
          className="absolute left-[10%] right-[10%] pointer-events-none"
          animate={{ opacity: [0.7, 0.45, 0.7], scaleX: [1, 0.95, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          style={{
            bottom: -14,
            height: 12,
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
        className="absolute inset-0 flex flex-col text-left px-3.5 py-3"
        style={{ cursor: "inherit", touchAction: "none", borderRadius: 10, overflow: "hidden" }}
        aria-label={`${f.name}, ${f.loadDays.toFixed(1)} days of load${out ? ", out of this release" : ""}. Drag to move, or click to open.`}
      >
        {raw && <span aria-hidden className="absolute inset-0 i-hatch" style={{ opacity: 0.5 }} />}

        <div className="relative flex items-center gap-1.5" style={{ minHeight: 13 }}>
          {classLabel(f) && (
            <span
              className="rounded-sm px-1 py-px text-[8px] font-semibold uppercase tracking-[0.09em]"
              style={{ color: accent, border: `1px solid color-mix(in srgb, ${accent} 55%, transparent)`, opacity: 0.8 }}
            >
              {classLabel(f)}
            </span>
          )}
          {raw && (
            <span className="text-[8px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--i-amber)", opacity: 0.7 }}>
              unassigned
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

        {/* The level: this capability's share of the release, along its own
            bottom edge. A weight, not a chart. */}
        <div className="relative mt-2 h-[2px] rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.5)" }}>
          <motion.div
            className="h-full"
            initial={false}
            animate={{ width: out ? "0%" : `${Math.min(100, share * 100 * 2.6)}%` }}
            transition={{ type: "spring", stiffness: 240, damping: 32 }}
            style={{ background: accent, opacity: out ? 0 : raw ? 0.5 : 0.7 }}
          />
        </div>
      </button>
    </motion.div>
  );
}
