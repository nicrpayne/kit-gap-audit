import { NextRequest, NextResponse } from "next/server";
import {
  activateProjectBootstrap,
  ActivationConflictError,
  ActivationValidationError,
  type ActivationRequest,
} from "@/lib/bootstrap/activation";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as ActivationRequest | null;
  if (!body || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) {
    return NextResponse.json({ error: "expectedRevision is required" }, { status: 400 });
  }
  try {
    const result = await activateProjectBootstrap(id, body);
    return NextResponse.json({
      ...result,
      links: {
        firstAudit: `/audit?project=${encodeURIComponent(result.scope.id)}&select=audit:${result.audit.id}`,
        auditWorld: `/audit?project=${encodeURIComponent(result.scope.id)}`,
        scope: `/scope?project=${encodeURIComponent(result.scope.id)}`,
        reports: `/reports?project=${encodeURIComponent(result.scope.id)}`,
      },
    }, { status: result.reused ? 200 : 201 });
  } catch (error) {
    const status = error instanceof ActivationConflictError ? 409 : error instanceof ActivationValidationError ? error.status : 500;
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Activation failed",
      blockers: error instanceof ActivationValidationError ? error.blockers : undefined,
    }, { status });
  }
}
