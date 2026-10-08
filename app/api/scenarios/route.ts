import { NextRequest, NextResponse } from "next/server";
import { SavedScenarioValidationError, readSavedScenarioJsonBody } from "@/lib/scenario/saved";
import {
  createSavedScenario,
  listSavedScenarios,
  SavedScenarioConflictError,
  SavedScenarioSourceUnavailableError,
} from "@/lib/scenario/savedStore";

// This route inherits the app-wide middleware policy: APP_PASSWORD protects
// it when configured; when APP_PASSWORD is absent, that middleware passes the
// request through (there is no separate production-mode guard here). There is
// no per-user Scenario identity. The request also cannot select a namespace or
// workspace; all callers share Signal's one workspace.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

function objectBody(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SavedScenarioValidationError("Request body must be a JSON object.");
  }
  const body = value as Record<string, unknown>;
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new SavedScenarioValidationError(`Unsupported request fields: ${unknown.sort().join(", ")}.`);
  return body;
}

function errorResponse(error: unknown) {
  const status = error instanceof SavedScenarioValidationError ||
    error instanceof SavedScenarioConflictError ||
    error instanceof SavedScenarioSourceUnavailableError
    ? error.status
    : 500;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Saved Scenario request failed." },
    { status, headers: NO_STORE },
  );
}

export async function GET(request: NextRequest) {
  const rawStatus = request.nextUrl.searchParams.get("status") ?? "active";
  if (rawStatus !== "active" && rawStatus !== "archived" && rawStatus !== "all") {
    return NextResponse.json({ error: "status must be active, archived, or all." }, { status: 400, headers: NO_STORE });
  }
  try {
    return NextResponse.json(await listSavedScenarios(rawStatus), { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = objectBody(await readSavedScenarioJsonBody(request), ["name", "payload", "baseline", "idempotencyKey"]);
    const result = await createSavedScenario({
      name: body.name,
      payload: body.payload,
      baseline: body.baseline,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json(result, { status: result.reused ? 200 : 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
