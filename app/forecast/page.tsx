import ForecastPageClient from "@/components/ForecastPageClient";

export default function ForecastPage() {
  return (
    <div className="p-10 max-w-3xl">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-accent)] mb-2">
        Forecast
      </div>
      <h1 className="font-display text-3xl mb-2">When will this ship?</h1>
      <p className="text-[var(--color-ink-soft)] mb-8">
        Simulated from Linear estimates, un-ticketed findings, and open blocking decisions.
      </p>
      <ForecastPageClient />
    </div>
  );
}
