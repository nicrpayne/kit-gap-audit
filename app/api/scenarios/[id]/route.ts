import { NextRequest, NextResponse } from "next/server";
import { SavedScenarioValidationError, readSavedScenarioJsonBody } from "@/lib/scenario/saved";
import {
  getSavedScenario,
  SavedScenarioConflictError,
  SavedScenarioNotFoundError,
  SavedScenarioSourceUnavailableError,
  updateSavedScenario,
} from "@/lib/scenario/savedStore";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SavedScenarioValidationError("Request body must be a JSON object.");
  }
  const body = value as Record<string, unknown>;
  const allowed = new Set(["expectedRevision", "idempotencyKey", "name", "archived", "archiveReason", "payload", "baseline"]);
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length) throw new SavedScenarioValidationError(`Unsupported request fields: ${unknown.sort().join(", ")}.`);
  return body;
}

function errorResponse(error: unknown) {
  const status = error instanceof SavedScenarioValidationError ||
    error instanceof SavedScenarioConflictError ||
    error instanceof SavedScenarioNotFoundError ||
    error instanceof SavedScenarioSourceUnavailableError
    ? error.status
    : 500;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Saved Scenario request failed." },
    { status, headers: NO_STORE },
  );
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await getSavedScenario(id), { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = objectBody(await readSavedScenarioJsonBody(request));
    const result = await updateSavedScenario(id, {
      expectedRevision: body.expectedRevision,
      idempotencyKey: body.idempotencyKey,
      ...(Object.prototype.hasOwnProperty.call(body, "name") ? { name: body.name } : {}),
      ...(Object.prototype.hasOwnProperty.call(body, "archived") ? { archived: body.archived } : {}),
      ...(Object.prototype.hasOwnProperty.call(body, "archiveReason") ? { archiveReason: body.archiveReason } : {}),
      ...(Object.prototype.hasOwnProperty.call(body, "payload") ? { payload: body.payload } : {}),
      ...(Object.prototype.hasOwnProperty.call(body, "baseline") ? { baseline: body.baseline } : {}),
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
