import { NextRequest, NextResponse } from "next/server";
import { BootstrapPackageValidationError, validateBootstrapPackage } from "@/lib/bootstrap/contracts";
import { ingestBootstrapPackage } from "@/lib/bootstrap/transport";

const SENSITIVE = /^(access_?token|refresh_?token|api_?key|password|client_?secret|authorization)$/i;

function rejectSecrets(value: unknown, path = "package") {
  if (Array.isArray(value)) return value.forEach((item, index) => rejectSecrets(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE.test(key)) throw new BootstrapPackageValidationError(`${path}.${key} may not contain connector credentials`);
    rejectSecrets(child, `${path}.${key}`);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raw = await req.text();
  if (raw.length > 5_000_000) return NextResponse.json({ error: "Bootstrap package exceeds 5 MB" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  let pkg;
  try {
    rejectSecrets(body);
    pkg = validateBootstrapPackage(body, id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid bootstrap package" }, { status: 400 });
  }
  const result = await ingestBootstrapPackage(id, pkg);
  return NextResponse.json(result.body, { status: result.status });
}
