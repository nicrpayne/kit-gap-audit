import ReportsPageClient from "@/components/ReportsPageClient";

export default function ReportsPage() {
  return (
    <div className="p-10 max-w-4xl">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-accent)] mb-2">
        Reports
      </div>
      <h1 className="font-display text-3xl mb-2">The leadership update</h1>
      <p className="text-[var(--color-ink-soft)] mb-8">
        One click: the current forecast, what shipped, what&apos;s blocking, and what changed since
        the last report — ready to copy and send.
      </p>
      <ReportsPageClient />
    </div>
  );
}
