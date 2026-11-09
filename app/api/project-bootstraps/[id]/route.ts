import { NextRequest, NextResponse } from "next/server";
import { readBootstrap } from "@/lib/bootstrap/read";
import { editBootstrap } from "@/lib/bootstrap/identity";
import { parseBootstrapPatch } from "@/lib/bootstrap/input";
import { readJsonObject } from "@/lib/http/json";
import { writeErrorResponse } from "@/lib/http/writeErrors";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await readBootstrap(id);
  if (!result) return NextResponse.json({ error: "Project bootstrap not found" }, { status: 404 });
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const input = parseBootstrapPatch(await readJsonObject(req));
    const { id } = await params;
    const bootstrap = await editBootstrap(id, input);
    return NextResponse.json({ bootstrap });
  } catch (error) {
    return writeErrorResponse(error, "Could not save project setup. Please retry.");
  }
}
