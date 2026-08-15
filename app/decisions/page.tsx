import DecisionsPageClient from "@/components/DecisionsPageClient";

// Instrument Mode: no Workbench frame, no eyebrow, no intro paragraph --
// the surface owns the viewport and has to say what it is by being legible
// (see lib/shell/mode.ts). The old Workbench queue listed open decision
// Findings; Decisions are now a first-class model with a lifecycle and an
// explicit, auditable relationship to delivery, and the circuit is how
// that relationship is read.
export default function DecisionsPage() {
  return <DecisionsPageClient />;
}
