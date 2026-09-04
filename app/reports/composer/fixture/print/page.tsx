import { notFound } from "next/navigation";
import AudienceBriefView from "@/components/reports/AudienceBriefView";
import { assembleDecisionBrief } from "@/lib/reports/decisionBrief";
import { buildBriefRecipe } from "@/lib/reports/composer";
import { healthyOwnerFixture } from "@/scripts/lib/decision-brief-fixtures";

export const dynamic = "force-dynamic";

export default function ReportsComposerPrintFixturePage() {
  if (process.env.NODE_ENV === "production") notFound();
  const brief = assembleDecisionBrief(healthyOwnerFixture());
  return <main style={{ minHeight: "100vh", padding: 24, background: "#090f12" }}><AudienceBriefView brief={brief} recipe={buildBriefRecipe("delivery-leadership", "weekly-update", brief)} /></main>;
}
