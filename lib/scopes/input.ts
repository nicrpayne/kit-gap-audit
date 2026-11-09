import { RequestValidationError, requiredString } from "@/lib/http/json";
import { toDateOnly } from "@/lib/time/dateContract";

function stringList(value: unknown, field: string, maxLength = 200): string[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new RequestValidationError(`${field} must be an array of at most 100 strings`);
  }
  const strings = value.map((entry) => {
    if (typeof entry !== "string" || entry.length > maxLength) {
      throw new RequestValidationError(
        `${field} entries must be strings of at most ${maxLength} characters`,
      );
    }
    return entry.trim();
  });
  return [...new Set(strings.filter(Boolean))];
}

function nullableString(value: unknown, field: string, maxLength: number): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new RequestValidationError(
      `${field} must be null or a string of at most ${maxLength} characters`,
    );
  }
  return value.trim() || null;
}

export interface ScopePatchInput {
  name?: string;
  teamKey?: string;
  projectNames?: string[];
  labelFilter?: string | null;
  targetDate?: string | null;
  teamCapacity?: number | null;
  includeTriage?: boolean;
  estimationContext?: string | null;
  notionPageUrls?: string[];
  figmaUrls?: string[];
  dependsOnScopeIds?: string[];
  expectedRealityRevision?: number;
  idempotencyKey?: string;
}

/** Validate before any provider/DB access; omitted fields remain omitted on PATCH. */
export function parseScopePatchInput(body: Record<string, unknown>): ScopePatchInput {
  const parsed: ScopePatchInput = {};
  for (const field of ["name", "teamKey", "idempotencyKey"] as const) {
    if (body[field] !== undefined) parsed[field] = requiredString(body[field], field);
  }
  for (const field of ["projectNames", "dependsOnScopeIds"] as const) {
    if (body[field] !== undefined) parsed[field] = stringList(body[field], field);
  }
  for (const field of ["notionPageUrls", "figmaUrls"] as const) {
    if (body[field] !== undefined) parsed[field] = stringList(body[field], field, 2048);
  }
  if (body.labelFilter !== undefined)
    parsed.labelFilter = nullableString(body.labelFilter, "labelFilter", 200);
  if (body.estimationContext !== undefined) {
    parsed.estimationContext = nullableString(body.estimationContext, "estimationContext", 20_000);
  }
  if (body.includeTriage !== undefined) {
    if (typeof body.includeTriage !== "boolean")
      throw new RequestValidationError("includeTriage must be a boolean");
    parsed.includeTriage = body.includeTriage;
  }
  if (body.teamCapacity !== undefined) {
    const value = body.teamCapacity;
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      throw new RequestValidationError(
        "teamCapacity must be null or a finite, non-negative number",
      );
    }
    parsed.teamCapacity = value === 0 ? null : value;
  }
  if (body.expectedRealityRevision !== undefined) {
    const value = body.expectedRealityRevision;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new RequestValidationError(
        "expectedRealityRevision must be a non-negative safe integer",
      );
    }
    parsed.expectedRealityRevision = value;
  }
  if (body.targetDate !== undefined) {
    const value = body.targetDate;
    if (value === null || value === "") parsed.targetDate = null;
    else {
      try {
        if (
          typeof value !== "string" ||
          !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
            value,
          )
        ) {
          throw new Error("date format");
        }
        // Date.parse accepts February 30 by rolling into March; reject that.
        toDateOnly(value.slice(0, 10));
        if (!Number.isFinite(new Date(value).getTime())) throw new Error("invalid date");
        parsed.targetDate = value;
      } catch {
        throw new RequestValidationError(
          "targetDate must be a valid YYYY-MM-DD date or offset-bearing ISO timestamp, or null",
        );
      }
    }
  }
  return parsed;
}

export function parseScopeInput(body: Record<string, unknown>) {
  const name = requiredString(body.name, "name");
  const teamKey = requiredString(body.teamKey, "teamKey");
  let projectNames: string[] | undefined;
  if (body.projectNames !== undefined) {
    if (!Array.isArray(body.projectNames) || body.projectNames.length > 100) {
      throw new RequestValidationError("projectNames must be an array of at most 100 names");
    }
    projectNames = body.projectNames.map((value) => requiredString(value, "projectNames entry"));
  }
  const labelFilter =
    body.labelFilter === undefined || body.labelFilter === null || body.labelFilter === ""
      ? null
      : requiredString(body.labelFilter, "labelFilter");
  return {
    name,
    teamKey,
    projectNames,
    labelFilter,
    ...(body.dependsOnScopeIds !== undefined
      ? { dependsOnScopeIds: stringList(body.dependsOnScopeIds, "dependsOnScopeIds") }
      : {}),
  };
}
