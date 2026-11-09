import { isRecord, RequestValidationError, requiredString } from "@/lib/http/json";
import type { ActivationRequest, ExecutionState } from "./activation";

const states = new Set<ExecutionState>(["configured", "not_configured", "unavailable", "stale"]);

function strings(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new RequestValidationError(`${field} must be an array of at most 100 strings`);
  return [...new Set(value.map((item) => requiredString(item, field)))];
}

export function parseActivationInput(body: Record<string, unknown>): ActivationRequest {
  if (
    typeof body.expectedRevision !== "number" ||
    !Number.isSafeInteger(body.expectedRevision) ||
    body.expectedRevision < 0
  ) {
    throw new RequestValidationError("expectedRevision must be a non-negative safe integer");
  }
  const parsed: ActivationRequest = { expectedRevision: body.expectedRevision };
  if (body.acknowledgedBlockerIds !== undefined)
    parsed.acknowledgedBlockerIds = strings(body.acknowledgedBlockerIds, "acknowledgedBlockerIds");
  if (body.acknowledgeProviderGaps !== undefined) {
    if (typeof body.acknowledgeProviderGaps !== "boolean")
      throw new RequestValidationError("acknowledgeProviderGaps must be a boolean");
    parsed.acknowledgeProviderGaps = body.acknowledgeProviderGaps;
  }
  if (body.execution !== undefined) {
    if (!isRecord(body.execution)) throw new RequestValidationError("execution must be an object");
    const input = body.execution,
      execution: NonNullable<ActivationRequest["execution"]> = {};
    if (input.state !== undefined) {
      if (typeof input.state !== "string" || !states.has(input.state as ExecutionState))
        throw new RequestValidationError("execution.state is not recognized");
      execution.state = input.state as ExecutionState;
    }
    if (input.teamKey !== undefined)
      execution.teamKey = requiredString(input.teamKey, "execution.teamKey");
    if (input.projectNames !== undefined)
      execution.projectNames = strings(input.projectNames, "execution.projectNames");
    for (const field of ["labelFilter", "detail"] as const) {
      if (input[field] !== undefined)
        execution[field] =
          input[field] === null || input[field] === ""
            ? null
            : requiredString(input[field], `execution.${field}`, field === "detail" ? 2000 : 200);
    }
    parsed.execution = execution;
  }
  return parsed;
}
