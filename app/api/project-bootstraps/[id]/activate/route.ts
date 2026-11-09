import { NextRequest, NextResponse } from "next/server";
import {
  activateProjectBootstrap,
  ActivationConflictError,
  ActivationValidationError,
} from "@/lib/bootstrap/activation";
import { readJsonObject } from "@/lib/http/json";
import { writeErrorResponse } from "@/lib/http/writeErrors";
import { parseActivationInput } from "@/lib/bootstrap/activationInput";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = parseActivationInput(await readJsonObject(req));
    const result = await activateProjectBootstrap(id, body);
    return NextResponse.json(
      {
        ...result,
        links: {
          firstAudit: `/audit?project=${encodeURIComponent(result.scope.id)}&select=audit:${result.audit.id}`,
          auditWorld: `/audit?project=${encodeURIComponent(result.scope.id)}`,
          scope: `/scope?project=${encodeURIComponent(result.scope.id)}`,
          reports: `/reports?project=${encodeURIComponent(result.scope.id)}`,
        },
      },
      { status: result.reused ? 200 : 201 },
    );
  } catch (error) {
    if (
      !(error instanceof ActivationConflictError) &&
      !(error instanceof ActivationValidationError)
    ) {
      return writeErrorResponse(
        error,
        "Could not activate the project. Reload to check its status before retrying.",
      );
    }
    const status = error instanceof ActivationConflictError ? 409 : error.status;
    return NextResponse.json(
      {
        error: error.message,
        blockers: error instanceof ActivationValidationError ? error.blockers : undefined,
      },
      { status },
    );
  }
}
