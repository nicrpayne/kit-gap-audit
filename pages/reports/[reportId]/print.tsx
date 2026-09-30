import type { GetServerSideProps } from "next";
import Head from "next/head";
import { prisma } from "@/lib/prisma";
import DecisionBriefView from "@/components/DecisionBriefView";
import ReportView from "@/components/ReportView";
import { isDecisionBriefV1 } from "@/lib/reports/decisionBrief";
import AudienceBriefView from "@/components/reports/AudienceBriefView";
import { isBriefRecipeV1 } from "@/lib/reports/composer";

type PrintProps = {
  report: {
    scopeId: string;
    summaryMarkdown: string;
    briefSnapshot: unknown;
    briefRecipe: unknown;
  };
};

// Print is deliberately a buffered SSR page, not an App Router stream.
// Safari must receive the visible report in the initial document: printing
// cannot depend on hydration or a streamed Suspense boundary replacing a
// loading skeleton. The URL, authentication and snapshot renderers are shared.
export const getServerSideProps: GetServerSideProps<PrintProps> = async ({ params, res }) => {
  res.setHeader("Cache-Control", "private, no-store");
  const reportId = params?.reportId;
  if (typeof reportId !== "string") return { notFound: true };
  // Historical print is intentionally snapshot-only. This route performs no
  // Forecast, Audit, Decision, Capacity or Timeline read.
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { scopeId: true, summaryMarkdown: true, briefSnapshot: true, briefRecipe: true },
  });
  if (!report) return { notFound: true };
  return { props: { report } };
};

export default function ReportPrintPage({ report }: PrintProps) {
  const brief = isDecisionBriefV1(report.briefSnapshot) ? report.briefSnapshot : null;
  const recipe = isBriefRecipeV1(report.briefRecipe) ? report.briefRecipe : null;

  return (
    <main className="report-print-page min-h-screen bg-[var(--i-bg)] px-6 py-8 print:bg-white print:p-0">
      <Head><title>Signal · Saved report</title></Head>
      <div className="report-no-print mx-auto mb-5 flex max-w-[920px] items-center justify-between rounded border border-[var(--i-border)] bg-[var(--i-panel)] px-4 py-3 text-xs text-[var(--i-text-soft)]">
        <span>Immutable snapshot only · use your browser’s Print command to save or print.</span>
        <a href={`/reports?project=${encodeURIComponent(report.scopeId)}`} className="text-[var(--i-signal)] hover:underline">Back to Reports</a>
      </div>
      {brief && recipe ? <AudienceBriefView brief={brief} recipe={recipe} /> : brief ? <DecisionBriefView brief={brief} /> : (
        <article className="decision-brief-print mx-auto max-w-[920px] rounded border border-[var(--i-border)] bg-[var(--i-panel)] p-8">
          <div className="mb-5 rounded border border-[var(--i-amber)] bg-[var(--i-amber-soft)] p-3 text-xs text-[var(--i-amber)]">Legacy immutable report · raw history retained exactly; unsafe source payloads are compacted in presentation.</div>
          <ReportView markdown={report.summaryMarkdown} />
        </article>
      )}
    </main>
  );
}
