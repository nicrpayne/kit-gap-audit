import { NextRequest, NextResponse } from "next/server";
import { capabilityWriteReceipt } from "@/lib/scope/reality";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key.length > 200) return NextResponse.json({ error: "Save key required." }, { status: 400 });
  const receipt = await capabilityWriteReceipt(key, id);
  return NextResponse.json({ receipt }, { headers: { "Cache-Control": "no-store" } });
}
