import PortfolioPageClient from "@/components/PortfolioPageClient";

// Instrument Mode: this route renders no Workbench page furniture at all --
// no cream frame, no eyebrow, no heading, no intro paragraph. The client
// component below is a fixed, full-viewport surface (see lib/shell/mode.ts).
// Explaining the instrument in a paragraph above it was the old shell's job;
// the instrument now has to say what it is by being legible.
export default function PortfolioPage() {
  return <PortfolioPageClient />;
}
