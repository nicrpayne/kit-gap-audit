"use client";
import { useState } from "react";

export default function ReportPdfDownload({ url, className }: { url: string; className?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function download() {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? "PDF could not be downloaded. Please try again."); }
      if (!response.headers.get("content-type")?.startsWith("application/pdf")) throw new Error("The report did not return a PDF. Sign in again and retry.");
      const objectUrl = URL.createObjectURL(await response.blob()), link = document.createElement("a");
      link.href = objectUrl; link.download = "signal-saved-report.pdf"; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) { setError(e instanceof Error ? e.message : "PDF download failed. Please try again."); }
    finally { setBusy(false); }
  }
  return <span><button type="button" className={className} disabled={busy} onClick={download}>{busy ? "Preparing PDF…" : "Download PDF"}</button>{error && <span role="alert" style={{ display: "block", maxWidth: "32rem", marginTop: ".5rem" }}>{error}</span>}</span>;
}
