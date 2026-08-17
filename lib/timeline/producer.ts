// HOW A PRODUCER'S NAME IS SPOKEN, NOT WHAT IT IS.
//
// Provenance is stored exactly as the producing system reported it —
// `hermes · Aug 12 refinement call`, `gap_app · Launch readiness` — and that
// string is an attestation. It is not ours to rewrite: the moment a display
// layer starts editing where something came from, the whole claim to be
// "visibly attested" is worth nothing.
//
// But `gap_app` is an identifier, and reading an identifier on a product
// surface is a small tax charged to a person for the convenience of the
// system that wrote it. So this maps a CLOSED set of known producer tokens to
// the name a person would say, and does it at the point of drawing, never at
// the point of storing.
//
// Two rules keep it honest:
//
//   1. ONLY KNOWN VALUES. A producer nobody has taught this about is shown
//      verbatim. A prettified guess would be the display layer inventing
//      provenance, which is the exact failure it exists to avoid.
//
//   2. ONLY THE PRODUCER. The source reference after the separator is free
//      text from the source itself — a page title, a transcript name — and is
//      passed through untouched.

const SPOKEN: Record<string, string> = {
  hermes: "Hermes",
  gap_app: "Gap App",
  manual: "Manual",
};

/** The producer token as a person would say it, or verbatim if unknown. */
export function producerLabel(raw: string): string {
  return SPOKEN[raw] ?? raw;
}

/**
 * A stored `sourceLabel` rendered for reading.
 *
 * The stored form is `<producer> · <sourceRef>`; only the producer half is
 * mapped, and a label with no separator is treated as a bare producer. The
 * input is never mutated — callers keep the raw value and pass it here each
 * time they draw it.
 */
export function spokenSourceLabel(stored: string | null | undefined): string {
  if (!stored) return "";
  const at = stored.indexOf(" · ");
  if (at === -1) return producerLabel(stored);
  return `${producerLabel(stored.slice(0, at))}${stored.slice(at)}`;
}
