import { cookies } from "next/headers";
import { readSharedReport } from "@/lib/reports/sharing";
import { READER_COOKIE, sharingSetup } from "@/lib/reports/sharingPolicy";
import RecipientReportView from "@/components/reports/RecipientReportView";
import ReportReaderAccess from "@/components/reports/ReportReaderAccess";
import styles from "@/components/reports/RecipientReport.module.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Signal · Private report", robots: { index: false, follow: false } };

export default async function PrivateReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = sharingSetup().config;
  const saved = config ? await readSharedReport(config, id, (await cookies()).get(READER_COOKIE)?.value) : null;
  return <main className={styles.page}><div className={styles.wrap}>
    <p className={styles.label}>Signal · shared privately</p>
    {!saved ? <ReportReaderAccess shareId={id} /> : <>
      <p className={styles.muted}>Read-only snapshot · access expires {new Date(saved.expiresAt).toLocaleDateString("en-US", { timeZone: "UTC" })}. Do not forward private content.</p>
      <ReportReaderAccess shareId={id} signedIn /><RecipientReportView snapshot={saved.snapshot} />
    </>}
  </div></main>;
}
