import type { Prisma } from "@prisma/client";
import { RequestValidationError } from "@/lib/http/json";

/** Check the graph in the same Serializable transaction that changes its edges. */
export async function assertScopeDependenciesValid(
  tx: Prisma.TransactionClient,
  id: string,
  ids: string[],
): Promise<void> {
  if (ids.includes(id)) throw new RequestValidationError("A project cannot depend on itself.");
  const scopes = await tx.scope.findMany({
    select: { id: true, name: true, dependsOnScopeIds: true },
  });
  const byId = new Map(scopes.map((scope) => [scope.id, scope]));
  if (ids.some((dependency) => !byId.has(dependency))) {
    throw new RequestValidationError(
      "One or more dependency projects no longer exist. Reload before retrying.",
    );
  }
  const path: string[] = [];
  const visiting = new Set<string>(),
    done = new Set<string>();
  const visit = (node: string): void => {
    if (done.has(node)) return;
    if (visiting.has(node)) {
      const cycle = [...path.slice(path.indexOf(node)), node].map(
        (key) => byId.get(key)?.name ?? key,
      );
      throw new RequestValidationError(
        `That would create a circular dependency: ${cycle.join(" → ")}. A project cannot wait on itself through another project.`,
      );
    }
    visiting.add(node);
    path.push(node);
    for (const dependency of node === id ? ids : (byId.get(node)?.dependsOnScopeIds ?? []))
      visit(dependency);
    path.pop();
    visiting.delete(node);
    done.add(node);
  };
  visit(id);
}
