import ReportsPageClient from "@/components/ReportsPageClient";
import SignalSurface from "@/components/instrument/SignalSurface";

export default function ReportsPage() {
  return (
    <SignalSurface
      eyebrow="Reports"
      title="Decision Brief"
      lede="One immutable, source-aware statement of where the project stands, what changed, and which calls need leadership."
    >
      <ReportsPageClient />
    </SignalSurface>
  );
}
