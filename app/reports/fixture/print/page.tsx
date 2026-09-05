import { notFound } from "next/navigation";
import DecisionBriefView from "@/components/DecisionBriefView";
import { assembleDecisionBrief } from "@/lib/reports/decisionBrief";
import { healthyOwnerFixture } from "@/scripts/lib/decision-brief-fixtures";

export const dynamic = "force-dynamic";

/** Deterministic local-only print fixture. It is unavailable in production. */
export default function DecisionBriefPrintFixturePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="min-h-screen bg-[var(--i-bg)] px-6 py-8 print:bg-white print:p-0">
      <DecisionBriefView brief={assembleDecisionBrief(healthyOwnerFixture())} />
    </main>
  );
}
