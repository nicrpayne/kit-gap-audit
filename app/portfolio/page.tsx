import PortfolioPageClient from "@/components/PortfolioPageClient";

export default function PortfolioPage() {
  return (
    <div className="p-10 max-w-5xl">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-accent)] mb-2">
        Portfolio
      </div>
      <h1 className="font-display text-3xl mb-2">What if we moved someone?</h1>
      <p className="text-[var(--color-ink-soft)] mb-8">
        Drag an allocation and watch every affected release date recompute live -- nothing is saved
        until you say so.
      </p>
      <PortfolioPageClient />
    </div>
  );
}
