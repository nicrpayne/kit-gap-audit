import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import DecisionBriefView from "@/components/DecisionBriefView";
import ReportView from "@/components/ReportView";
import { isDecisionBriefV1 } from "@/lib/reports/decisionBrief";

export const dynamic = "force-dynamic";

export default async function ReportPrintPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  // Historical print is intentionally snapshot-only. This route performs no
  // Forecast, Audit, Decision, Capacity or Timeline read.
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) notFound();
  const brief = isDecisionBriefV1(report.briefSnapshot) ? report.briefSnapshot : null;

  return (
    <main className="min-h-screen bg-[var(--i-bg)] px-6 py-8 print:bg-white print:p-0">
      <div className="report-no-print mx-auto mb-5 flex max-w-[920px] items-center justify-between rounded border border-[var(--i-border)] bg-[var(--i-panel)] px-4 py-3 text-xs text-[var(--i-text-soft)]">
        <span>Immutable snapshot only · use your browser’s Print command to save or print.</span>
        <a href={`/reports?project=${encodeURIComponent(report.scopeId)}`} className="text-[var(--i-signal)] hover:underline">Back to Reports</a>
      </div>
      {brief ? <DecisionBriefView brief={brief} /> : (
        <article className="decision-brief-print mx-auto max-w-[920px] rounded border border-[var(--i-border)] bg-[var(--i-panel)] p-8">
          <div className="mb-5 rounded border border-[var(--i-amber)] bg-[var(--i-amber-soft)] p-3 text-xs text-[var(--i-amber)]">Legacy immutable report · rendered exactly as stored.</div>
          <ReportView markdown={report.summaryMarkdown} />
        </article>
      )}
    </main>
  );
}
