// ONE ICON SYSTEM FOR AUDIT.
//
// Every glyph here is drawn on the SAME 24×24 grid, with the SAME 1.5 stroke
// weight, round caps and round joins, and no fills. That uniformity is the
// whole point: the concept images' icons drift between weights and sizes,
// and a question mark escaping its holder is the kind of detail that makes a
// dense surface read as a mock-up rather than as an instrument.
//
// Sizing is fixed by `IconHolder` rather than left to each caller — a 16px
// glyph centred in a 26px holder, using grid placement so centring is real
// rather than approximate line-height luck.

import type { ReactNode } from "react";

export const ICON_PX = 16;
export const HOLDER_PX = 26;

function Svg({ children, size = ICON_PX }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", overflow: "visible" }}
    >
      {children}
    </svg>
  );
}

// ── LANES ──────────────────────────────────────────────────────────────

/** Reality: concentric, centred, closed — the shape of a settled reference. */
export const RealityIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.5" />
  </Svg>
);

/** Decisions: one path arriving, two leaving. A choice, not a document. */
export const DecisionsIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M4 12h5" />
    <path d="M9 12l5-5.5" />
    <path d="M9 12l5 5.5" />
    <circle cx="16.5" cy="6.5" r="2.2" />
    <circle cx="16.5" cy="17.5" r="2.2" />
  </Svg>
);

/** Dependencies: a chain of two, one waiting on the other. */
export const DependenciesIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="6.5" cy="7" r="2.6" />
    <circle cx="17.5" cy="17" r="2.6" />
    <path d="M6.5 9.8v4.4a2.4 2.4 0 0 0 2.4 2.4h5.9" />
  </Svg>
);

/** Capacity: a filled arc on a dial — how much of a whole is committed. */
export const CapacityIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5A8.5 8.5 0 0 1 20.5 12" strokeWidth={2.6} />
    <path d="M12 12l3.6-3.6" />
  </Svg>
);

// ── EVIDENCE / EXTERNAL ────────────────────────────────────────────────

/** Linear: tracked work, checked off. */
export const LinearIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M4 7.5l2.2 2.2L10 6" />
    <path d="M4 16.5l2.2 2.2L10 15" />
    <path d="M13 8h7" />
    <path d="M13 17h7" />
  </Svg>
);

/** Notion: a requirements page with ruled lines. */
export const NotionIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <rect x="5" y="3.5" width="14" height="17" rx="2" />
    <path d="M8.5 8.5h7" />
    <path d="M8.5 12h7" />
    <path d="M8.5 15.5h4" />
  </Svg>
);

/** Figma: stacked design surfaces. */
export const FigmaIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M12 3.2l8.2 4.4-8.2 4.4L3.8 7.6z" />
    <path d="M3.8 12.4l8.2 4.4 8.2-4.4" />
    <path d="M3.8 16.8l8.2 4 8.2-4" />
  </Svg>
);

/** Hermes / Wiki: layered intelligence, read but not authoritative. */
export const HermesIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M3.5 8.5c2.2-1.6 4.4-1.6 6.6 0s4.4 1.6 6.6 0 4.4-1.6 3.8-.4" />
    <path d="M3.5 13c2.2-1.6 4.4-1.6 6.6 0s4.4 1.6 6.6 0 4.4-1.6 3.8-.4" />
    <path d="M3.5 17.5c2.2-1.6 4.4-1.6 6.6 0s4.4 1.6 6.6 0 4.4-1.6 3.8-.4" />
  </Svg>
);

/** Evidence: a passage, quoted. */
export const EvidenceIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
    <path d="M8.5 9.5c0-1.1.9-2 2-2v1.6c-.5 0-.9.4-.9.9h.9v2.4H8.5z" />
    <path d="M13.5 9.5c0-1.1.9-2 2-2v1.6c-.5 0-.9.4-.9.9h.9v2.4h-2z" />
    <path d="M8.5 16.5h7" />
  </Svg>
);

// ── FINDING KINDS ──────────────────────────────────────────────────────

/** Missing work: an outline with nothing in it. */
export const MissingWorkIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M4.5 8V6a1.5 1.5 0 0 1 1.5-1.5h2" strokeDasharray="0" />
    <path d="M16 4.5h2A1.5 1.5 0 0 1 19.5 6v2" />
    <path d="M19.5 16v2a1.5 1.5 0 0 1-1.5 1.5h-2" />
    <path d="M8 19.5H6A1.5 1.5 0 0 1 4.5 18v-2" />
    <path d="M11 4.5h2M11 19.5h2M4.5 11v2M19.5 11v2" opacity="0.55" />
  </Svg>
);

/** Unresolved decision: a person holding an open question. */
export const UnresolvedDecisionIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="9.5" cy="8" r="3.2" />
    <path d="M3.8 19.5c0-3.1 2.6-5.2 5.7-5.2 1.1 0 2.1.3 3 .7" />
    <path d="M15.6 15.2c0-1 .8-1.7 1.8-1.7s1.8.7 1.8 1.7c0 1.3-1.8 1.4-1.8 2.7" />
    <path d="M17.4 20.3v.01" strokeWidth={2} />
  </Svg>
);

/** Blocking dependency: a link that has come apart. */
export const BlockingDependencyIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M10.2 7.4l1.6-1.6a3.6 3.6 0 0 1 5.1 5.1l-1.6 1.6" />
    <path d="M13.8 16.6l-1.6 1.6a3.6 3.6 0 0 1-5.1-5.1l1.6-1.6" />
    <path d="M8.6 4.6v2.2M4.6 8.6h2.2M19.4 15.4v2.2M15.4 19.4h2.2" opacity="0.75" />
  </Svg>
);

/** Contradiction: two readings that will not reconcile. */
export const ContradictionIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9 9l6 6" />
    <path d="M15 9l-6 6" />
  </Svg>
);

/** Risk / drift: a reading that has wandered off its mark. */
export const RiskIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M12 4.2l8.3 14.4a1 1 0 0 1-.87 1.5H4.57a1 1 0 0 1-.87-1.5z" />
    <path d="M12 10v4" />
    <path d="M12 17.2v.01" strokeWidth={2} />
  </Svg>
);

/** Stale evidence: a passage with time against it. */
export const StaleEvidenceIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M19.5 10.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h5" />
    <path d="M8 9h8M8 12.5h4" />
    <circle cx="17" cy="17" r="4" />
    <path d="M17 15.2V17l1.3 1.3" />
  </Svg>
);

// ── HOLDER ─────────────────────────────────────────────────────────────

/**
 * The one place icon sizing and centring is decided.
 *
 * Grid rather than flex, with the glyph in a single cell: `place-items:
 * center` centres on both axes against the holder's own box, so a glyph with
 * asymmetric strokes still sits optically centred instead of riding its
 * baseline. Every holder in Audit is the same size, which is what makes a
 * row of them read as a system.
 */
export function IconHolder({
  children,
  tone,
  size = HOLDER_PX,
  filled = true,
}: {
  children: ReactNode;
  /** A colour token, e.g. "var(--i-signal)". */
  tone: string;
  size?: number;
  filled?: boolean;
}) {
  return (
    <span
      style={{
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        borderRadius: 7,
        color: tone,
        background: filled ? "color-mix(in srgb, currentColor 11%, transparent)" : "transparent",
        border: `1px solid color-mix(in srgb, currentColor ${filled ? 26 : 16}%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export const LANE_ICONS: Record<string, (p: { size?: number }) => ReactNode> = {
  reality: RealityIcon,
  decisions: DecisionsIcon,
  dependencies: DependenciesIcon,
  capacity: CapacityIcon,
  linear: LinearIcon,
  notion: NotionIcon,
  figma: FigmaIcon,
  hermes: HermesIcon,
  evidence: EvidenceIcon,
};

/** Finding glyph by REAL Finding.type, sharpened by `blocking` the same way
    `kindLabelFor` sharpens the label — the icon and the name always agree. */
export function findingIcon(type: string, blocking: boolean): (p: { size?: number }) => ReactNode {
  if (type === "decision") return UnresolvedDecisionIcon;
  if (type === "missing_work") return MissingWorkIcon;
  if (type === "contradiction") return ContradictionIcon;
  return blocking ? BlockingDependencyIcon : RiskIcon;
}
