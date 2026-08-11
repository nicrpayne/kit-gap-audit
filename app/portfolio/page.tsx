import PortfolioPageClient from "@/components/PortfolioPageClient";

export default function PortfolioPage() {
  return (
    <div className="p-10 max-w-[1440px]">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-accent)] mb-2">
        Portfolio
      </div>
      <h1 className="font-display text-3xl mb-2">Play the project.</h1>
      <p className="text-[var(--color-ink-soft)] mb-8 max-w-2xl">
        Change a scope&rsquo;s capacity or target date and every affected release date recomputes
        live, right on the timeline -- nothing is written back until you commit it.
      </p>
      <PortfolioPageClient />
    </div>
  );
}
