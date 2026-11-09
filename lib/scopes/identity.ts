import type { Prisma } from "@prisma/client";
import { normalizeSearchText } from "@/lib/audit/searchText";
import { RequestValidationError } from "@/lib/http/json";

/** Same identity rules as reviewed project activation, including accepted aliases. */
export async function assertScopeIdentityAvailable(
  tx: Prisma.TransactionClient,
  names: readonly string[],
  excludingScopeId?: string,
): Promise<void> {
  const normalized = names.map(normalizeSearchText);
  if (normalized.some((name) => !name)) {
    throw new RequestValidationError("Project names and aliases must contain a letter or number.");
  }
  // These predicate reads MUST share a Serializable transaction with the write.
  // Checking before the transaction permits two simultaneous callers to pass.
  const [scopes, aliases] = await Promise.all([
    tx.scope.findMany({
      where: { id: { not: excludingScopeId } },
      select: { id: true, name: true },
    }),
    tx.scopeAlias.findMany({
      where: { scopeId: { not: excludingScopeId }, normalizedAlias: { in: normalized } },
      select: { alias: true },
    }),
  ]);
  const collision = scopes.find((scope) => normalized.includes(normalizeSearchText(scope.name)));
  if (collision || aliases[0]) {
    throw new RequestValidationError(
      `A project named or aliased “${collision?.name ?? aliases[0].alias}” already exists. Choose a distinct name.`,
      409,
    );
  }
}
