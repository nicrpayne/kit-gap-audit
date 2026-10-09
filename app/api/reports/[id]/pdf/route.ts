import { NextRequest, NextResponse } from "next/server";
import { loadSavedHandoff } from "@/lib/reports/loadSavedHandoff";
import { recipientSnapshot } from "@/lib/reports/recipientSnapshot";
import { renderReportPdf, ReportPdfError } from "@/lib/reports/pdf";
import { requireReportOwner, sharingFailure, privateJson } from "@/lib/reports/sharingHttp";
import { PRIVATE_HEADERS } from "@/lib/reports/sharingPolicy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireReportOwner(req);
    const { id } = await context.params;
    let snapshot;
    try { snapshot = recipientSnapshot(await loadSavedHandoff(id, req.nextUrl.searchParams.get("pair") === "1")); }
    catch { return privateJson({ error: "Choose a complete saved report. A comparison needs its original saved pair." }, 409); }
    const pdf = await renderReportPdf(snapshot);
    return new NextResponse(new Uint8Array(pdf), { headers: { ...PRIVATE_HEADERS, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="signal-saved-report.pdf"', "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return error instanceof ReportPdfError ? privateJson({ error: error.message }, 422) : sharingFailure(error); }
}
