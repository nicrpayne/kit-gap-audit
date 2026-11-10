"use client";

import React, { useState } from "react";

interface ReportPdfDownloadProps {
  url: string;
  className?: string;
}

export default function ReportPdfDownload({ url, className }: ReportPdfDownloadProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState(false);

  async function download() {
    setBusy(true);
    setError("");
    setPrepared(false);
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "PDF could not be downloaded. Please try again.");
      }
      if (!response.headers.get("content-type")?.startsWith("application/pdf")) {
        throw new Error("The report did not return a PDF. Sign in again and retry.");
      }

      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      try {
        link.href = objectUrl;
        link.download = "signal-saved-report.pdf";
        document.body.appendChild(link);
        link.click();
        // Preparing bytes is observable; the browser saving them is not.
        setPrepared(true);
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "PDF download failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-block", maxWidth: "32rem" }}>
      <button type="button" className={className} disabled={busy} onClick={download}>
        {busy ? "Preparing PDF…" : "Download PDF"}
      </button>
      {error && (
        <span role="alert" style={{ display: "block", marginTop: ".5rem" }}>
          {error}
        </span>
      )}
      {prepared && (
        <span role="status" style={{ display: "block", marginTop: ".5rem" }}>
          PDF prepared. Check your browser’s downloads.
        </span>
      )}
      <span style={{ display: "block", marginTop: ".5rem", fontSize: ".8rem" }}>
        Download not starting?{" "}
        {/* A real user-activated navigation works when an embedded browser does
            not handle asynchronous blob downloads. The same protected endpoint
            rechecks access; no copied token, public URL or permission bypass. */}
        <a
          href={url}
          download
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "underline" }}
        >
          Use browser download
        </a>{" "}
        (opens separately if needed).
      </span>
    </span>
  );
}
