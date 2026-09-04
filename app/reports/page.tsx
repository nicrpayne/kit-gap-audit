import ReportsPageClient from "@/components/ReportsPageClient";
import SignalSurface from "@/components/instrument/SignalSurface";

export default function ReportsPage() {
  return (
    <SignalSurface
      eyebrow="Reports"
      title="Brief Composer"
      lede="Configure the audience and purpose. Signal freezes the same source-aware project truth underneath every brief."
    >
      <ReportsPageClient />
    </SignalSurface>
  );
}
