import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionTokenFor } from "@/lib/auth";
import { equalSecret, sharingSetup } from "@/lib/reports/sharingPolicy";
import { listReportShares } from "@/lib/reports/sharing";
import { loadSavedHandoff } from "@/lib/reports/loadSavedHandoff";
import { recipientSnapshot } from "@/lib/reports/recipientSnapshot";
import RecipientReportView from "@/components/reports/RecipientReportView";
import ReportShareManager from "@/components/reports/ReportShareManager";
import ReportPdfDownload from "@/components/reports/ReportPdfDownload";
import styles from "@/components/reports/RecipientReport.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Private report sharing · Signal", robots: { index: false, follow: false } };
export default async function ShareReportPage({ params, searchParams }: { params: Promise<{ reportId: string }>; searchParams: Promise<{ pair?: string }> }) {
  const { reportId } = await params, pair = (await searchParams).pair === "1", password = process.env.APP_PASSWORD;
  if (!password) return <main className={styles.page}><h1>Operator sign-in is not configured</h1><p>Private report management is unavailable until operator authentication is enabled.</p></main>;
  if (!equalSecret((await cookies()).get(SESSION_COOKIE)?.value ?? "", await sessionTokenFor(password))) redirect(`/login?next=${encodeURIComponent(`/reports/${reportId}/share${pair ? "?pair=1" : ""}`)}`);
  const setup = sharingSetup();
  let snapshot, projectId;
  try { const handoff = await loadSavedHandoff(reportId, pair); snapshot = recipientSnapshot(handoff); projectId = handoff.reports[0].briefSnapshot.identity.project.value.id; }
  catch { return <main className={styles.page}><a href="/reports">Back to Reports</a><h1>This saved report cannot be shared</h1><p>Choose a complete saved report with a supported snapshot. A comparison also needs its original Reality and Scenario pair.</p></main>; }
  const shares = await listReportShares(reportId);
  return <main className={styles.page}><div className={styles.wrap}>
    <a className={styles.button} href={`/reports?project=${encodeURIComponent(projectId)}`}>← Back to Reports</a><p className={styles.label}>Operator only · private executive sharing</p><h1>Review, then share</h1>
    <ReportShareManager reportId={reportId} pair={pair} ready={!!setup.config} missing={setup.missing} publicOrigin={setup.config?.origin ?? null} initialShares={JSON.parse(JSON.stringify(shares))} />
    <h2>Executive preview — exactly what this new link will contain</h2><p>Read-only captured facts, expandable evidence and a schedule snapshot. This simplified view does not include the working app&apos;s controls, raw simulation data or links into private systems.</p>
    <ReportPdfDownload className={styles.button} url={`/api/reports/${encodeURIComponent(reportId)}/pdf${pair ? "?pair=1" : ""}`} />
    <RecipientReportView snapshot={snapshot} />
  </div></main>;
}
