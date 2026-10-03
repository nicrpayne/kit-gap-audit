import { NextRequest, NextResponse } from "next/server";
import { loadSavedHandoff } from "@/lib/reports/loadSavedHandoff";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const bundle = await loadSavedHandoff(id, req.nextUrl.searchParams.get("pair") === "1");
    return NextResponse.json(bundle, { headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'attachment; filename="signal-saved-report-handoff.json"',
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Saved report unavailable." }, {
      status: 409, headers: { "Cache-Control": "private, no-store" },
    });
  }
}
