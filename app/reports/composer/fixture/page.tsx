import { notFound } from "next/navigation";
import ReportsComposerPrototype from "@/components/reports/ReportsComposerPrototype";
import SignalSurface from "@/components/instrument/SignalSurface";
import { assembleDecisionBrief } from "@/lib/reports/decisionBrief";
import { healthyOwnerFixture } from "@/scripts/lib/decision-brief-fixtures";

export const dynamic = "force-dynamic";

export default function ReportsComposerFixturePage() {
  if (process.env.NODE_ENV === "production") notFound();
  const brief = assembleDecisionBrief(healthyOwnerFixture());
  return <SignalSurface eyebrow="Reports · prototype" title="Audience Brief Composer" lede="Configure the communication surface. The frozen owner facts do not move."><ReportsComposerPrototype brief={brief} /></SignalSurface>;
}
