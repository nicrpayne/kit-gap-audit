import ReportsPageClient from "@/components/ReportsPageClient";
import SignalSurface from "@/components/instrument/SignalSurface";

export default function ReportsPage() {
  return (
    <SignalSurface
      eyebrow="Reports"
      title="The leadership update"
      lede="One click: the current forecast, what shipped, what's blocking, and what changed since the last report — ready to copy and send."
    >
      <ReportsPageClient />
    </SignalSurface>
  );
}
