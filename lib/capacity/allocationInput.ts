import { isRecord, RequestValidationError, requiredString } from "@/lib/http/json";

export interface AllocationInput {
  personId: string;
  scopeId: string;
  fraction: number;
}

export function parseAllocationInput(body: Record<string, unknown>): AllocationInput[] {
  if (!Array.isArray(body.allocations) || body.allocations.length > 500) {
    throw new RequestValidationError("allocations must be an array of at most 500 entries");
  }
  const seen = new Set<string>();
  return body.allocations.map((value) => {
    if (!isRecord(value)) throw new RequestValidationError("Each allocation must be an object");
    const personId = requiredString(value.personId, "personId");
    const scopeId = requiredString(value.scopeId, "scopeId");
    if (
      typeof value.fraction !== "number" ||
      !Number.isFinite(value.fraction) ||
      value.fraction < 0 ||
      value.fraction > 1
    ) {
      throw new RequestValidationError("fraction must be a number between 0 and 1");
    }
    const pair = JSON.stringify([personId, scopeId]);
    if (seen.has(pair))
      throw new RequestValidationError(
        "Duplicate allocation for the same person and scope in one request",
      );
    seen.add(pair);
    return { personId, scopeId, fraction: value.fraction };
  });
}
