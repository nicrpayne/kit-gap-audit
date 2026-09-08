import { notFound } from "next/navigation";
import InteractiveBriefSitePreview from "@/components/reports/InteractiveBriefSitePreview";
import {
  executiveCompressedFixture,
  healthyLeadershipFixture,
  historicalScenarioFixture,
  incompleteNewProjectFixture,
  staleLiveOwnerFixture,
} from "@/scripts/lib/publication-fixtures";

const fixtures = {
  healthy: healthyLeadershipFixture,
  executive: executiveCompressedFixture,
  incomplete: incompleteNewProjectFixture,
  stale: staleLiveOwnerFixture,
  scenario: historicalScenarioFixture,
};

export function generateStaticParams() {
  return Object.keys(fixtures).map((fixture) => ({ fixture }));
}

export default async function SitePreviewFixturePage({ params }: { params: Promise<{ fixture: string }> }) {
  const { fixture } = await params;
  const build = fixtures[fixture as keyof typeof fixtures];
  if (!build) notFound();
  return <InteractiveBriefSitePreview bundle={build()} />;
}
