import type { GetServerSideProps } from "next";
import Head from "next/head";
import { loadSavedHandoff } from "@/lib/reports/loadSavedHandoff";
import type { SavedReportHandoff } from "@/lib/reports/savedHandoff";
import AudienceBriefView from "@/components/reports/AudienceBriefView";

export const getServerSideProps: GetServerSideProps<{ bundle: SavedReportHandoff; reportId: string; pair: boolean }> = async ({ params, query, res }) => {
  res.setHeader("Cache-Control", "private, no-store");
  const reportId = params?.reportId;
  if (typeof reportId !== "string") return { notFound: true };
  try {
    const pair = query.pair === "1";
    return { props: { bundle: await loadSavedHandoff(reportId, pair), reportId, pair } };
  } catch { return { notFound: true }; }
};

export default function SavedReportPreview({ bundle, reportId, pair }: { bundle: SavedReportHandoff; reportId: string; pair: boolean }) {
  return <main className="report-print-page min-h-screen p-6">
    <Head><title>Signal · Saved leadership handoff</title><meta name="robots" content="noindex,nofollow" /></Head>
    <header className="mx-auto mb-6 max-w-[1800px] rounded border border-[var(--i-border)] p-5">
      <h1 className="text-xl font-semibold">Saved leadership brief{pair ? " · Reality + Scenario" : ""}</h1>
      <p className="mt-2">Interactive frozen snapshot · no live data access · not published as a Site.</p>
      <p className="mt-2 text-[var(--i-amber)]">{bundle.disclosure}</p>
      <a className="report-no-print mt-4 inline-block underline" href={`/api/reports/${encodeURIComponent(reportId)}/handoff${pair ? "?pair=1" : ""}`}>Download saved data + Site handoff prompt</a>
      <details className="report-no-print mt-3"><summary>How to create the Site</summary><p className="mt-2">Download this package and attach it to a Site-building conversation. The prompt is included. Review the preview and disclosure before publishing. This does not automatically create, secure or update a hosted Site.</p><pre className="mt-2 whitespace-pre-wrap text-sm">{bundle.handoffPrompt}</pre></details>
    </header>
    <div className={pair ? "grid items-start gap-6 xl:grid-cols-2" : "mx-auto max-w-[1000px]"} data-shoot="saved-report-handoff">
      {bundle.reports.map((report) => <section key={report.reportId} data-report-id={report.reportId}>
        <p className="mb-3 text-xs">{report.briefSnapshot.identity.mode.toUpperCase()} · saved report {report.reportId} · {report.snapshotFingerprint}</p>
        <a className="report-no-print mb-3 inline-block underline" href={`/reports/${encodeURIComponent(report.reportId)}/print`} target="_blank" rel="noreferrer">Open matching print / PDF view</a>
        <AudienceBriefView brief={report.briefSnapshot} recipe={report.recipe} sitePreview />
      </section>)}
    </div>
  </main>;
}
