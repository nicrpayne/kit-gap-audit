import type { ReactNode } from "react";

/**
 * Product-owned boundary for Signal's future Reality mark.
 *
 * These are deliberately minimal evaluation placeholders, not a corporate
 * logo. Callers choose a variant here instead of importing third-party
 * iconography or baking a one-off SVG into Audit chrome.
 */
export type RealityGlyphVariant = "signal" | "orbit" | "relay";

export default function RealityGlyph({
  size = 18,
  variant = "signal",
  title,
}: {
  size?: number;
  variant?: RealityGlyphVariant;
  title?: string;
}) {
  const drawings: Record<RealityGlyphVariant, ReactNode> = {
    signal: (
      <>
        <path d="M4.2 12c2.1-4.7 4.7-7 7.8-7s5.7 2.3 7.8 7c-2.1 4.7-4.7 7-7.8 7s-5.7-2.3-7.8-7Z" />
        <path d="M7.8 12c1.1-2.2 2.5-3.3 4.2-3.3s3.1 1.1 4.2 3.3c-1.1 2.2-2.5 3.3-4.2 3.3S8.9 14.2 7.8 12Z" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      </>
    ),
    orbit: (
      <>
        <circle cx="12" cy="12" r="3.1" />
        <ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(-24 12 12)" />
        <circle cx="19.2" cy="8.4" r="1.2" fill="currentColor" stroke="none" />
      </>
    ),
    relay: (
      <>
        <path d="M5 17.5 9 6.5l3 7 3-4 4 8" />
        <circle cx="5" cy="17.5" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="9" cy="6.5" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="12" cy="13.5" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="15" cy="9.5" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="19" cy="17.5" r="1.3" fill="currentColor" stroke="none" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.45}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {drawings[variant]}
    </svg>
  );
}
