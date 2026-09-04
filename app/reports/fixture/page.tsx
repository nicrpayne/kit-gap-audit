import { notFound } from "next/navigation";
import SignalSurface from "@/components/instrument/SignalSurface";
import DecisionBriefView from "@/components/DecisionBriefView";
import { assembleDecisionBrief } from "@/lib/reports/decisionBrief";
import { healthyOwnerFixture } from "@/scripts/lib/decision-brief-fixtures";

export const dynamic = "force-dynamic";

/** Deterministic local-only visual fixture. It is unavailable in production. */
export default function DecisionBriefFixturePage() {
  if (process.env.NODE_ENV === "production") notFound();
  const brief = assembleDecisionBrief(healthyOwnerFixture());
  return (
    <SignalSurface eyebrow="Reports · deterministic fixture" title="Decision Brief" lede="Visual proof of the same immutable payload exercised by the Reports reconciliation suite.">
      <div className="rounded-xl border border-[var(--i-border)] bg-[var(--i-panel)] p-6">
        <DecisionBriefView brief={brief} />
      </div>
    </SignalSurface>
  );
}
