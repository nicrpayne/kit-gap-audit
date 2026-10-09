import { NextRequest, NextResponse } from "next/server";
import { readSharedReport } from "@/lib/reports/sharing";
import { sharingSetup, READER_COOKIE, PRIVATE_HEADERS } from "@/lib/reports/sharingPolicy";
import { privateJson, sharingFailure } from "@/lib/reports/sharingHttp";
import { renderReportPdf, ReportPdfError } from "@/lib/reports/pdf";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params, config = sharingSetup().config, token = req.cookies.get(READER_COOKIE)?.value;
    const report = config ? await readSharedReport(config, id, token) : null;
    if (!config || !report) return privateJson({ error: "Sign in to an available shared report before downloading." }, 401);
    const pdf = await renderReportPdf(report.snapshot);
    // Long exports cannot race a grant revocation or expiry undetected.
    if (!await readSharedReport(config, id, token)) return privateJson({ error: "Report access is no longer available." }, 401);
    return new NextResponse(new Uint8Array(pdf), { headers: { ...PRIVATE_HEADERS, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="signal-private-report.pdf"', "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return error instanceof ReportPdfError ? privateJson({ error: error.message }, 422) : sharingFailure(error); }
}
