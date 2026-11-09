import { normalizeSearchText } from "@/lib/audit/searchText";
import { RequestValidationError, requiredString } from "@/lib/http/json";

export interface BootstrapIdentityInput {
  canonicalName: string;
  aliases: string[];
  ownerHint: string | null;
  sourceHints: string[];
  searchExistingKnowledge: boolean;
}

function identityName(value: unknown): string {
  const name = requiredString(value, "Project name", 160);
  if (!normalizeSearchText(name)) {
    throw new RequestValidationError("Project names must contain a letter or number.");
  }
  return name;
}

/** Blank entries come from the comma-separated UI; malformed entries must not disappear. */
function list(value: unknown, field: string, length: number): string[] {
  if (!Array.isArray(value) || value.length > 20) {
    throw new RequestValidationError(`${field} must contain at most 20 strings.`);
  }
  const items = value.map((item) => {
    if (typeof item !== "string" || item.trim().length > length) {
      throw new RequestValidationError(
        `${field} entries must be strings of at most ${length} characters.`,
      );
    }
    return item.trim();
  });
  return [...new Set(items.filter(Boolean))];
}

export function parseBootstrapPatch(
  body: Record<string, unknown>,
): Partial<BootstrapIdentityInput> {
  const result: Partial<BootstrapIdentityInput> = {};
  if (body.canonicalName !== undefined) result.canonicalName = identityName(body.canonicalName);
  if (body.aliases !== undefined) {
    result.aliases = list(body.aliases, "Aliases", 160);
    if (result.aliases.some((alias) => !normalizeSearchText(alias))) {
      throw new RequestValidationError("Aliases must contain a letter or number.");
    }
  }
  if (body.ownerHint !== undefined) {
    if (body.ownerHint !== null && typeof body.ownerHint !== "string") {
      throw new RequestValidationError("Owner hint must be text or null.");
    }
    result.ownerHint = body.ownerHint?.trim()
      ? requiredString(body.ownerHint, "Owner hint", 200)
      : null;
  }
  if (body.sourceHints !== undefined)
    result.sourceHints = list(body.sourceHints, "Source hints", 2048);
  if (body.searchExistingKnowledge !== undefined) {
    if (typeof body.searchExistingKnowledge !== "boolean") {
      throw new RequestValidationError("Search existing knowledge must be true or false.");
    }
    result.searchExistingKnowledge = body.searchExistingKnowledge;
  }
  return result;
}

export function parseBootstrapCreate(body: Record<string, unknown>): BootstrapIdentityInput {
  return {
    aliases: [],
    ownerHint: null,
    sourceHints: [],
    searchExistingKnowledge: true,
    ...parseBootstrapPatch(body),
    canonicalName: identityName(body.canonicalName),
  };
}
