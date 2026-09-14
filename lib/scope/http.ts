import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";
import { ScopeRealityConflictError, ScopeRealityInputError, type OwnerWorkItem } from "@/lib/scope/reality";

export async function currentOwnerWork(scopeId: string, ids: string[]): Promise<OwnerWorkItem[]> {
  const scope = await prisma.scope.findUniqueOrThrow({ where: { id: scopeId } });
  const current = await getScopedIssues(scope);
  const byId = new Map(current.map((issue) => [issue.identifier, issue]));
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const missing = unique.filter((id) => !byId.has(id));
  if (missing.length) {
    throw new ScopeRealityInputError(
      `${missing.join(", ")} is not in the current Linear owner read for this Scope. Refresh before linking.`,
    );
  }
  return unique.map((id) => {
    const issue = byId.get(id)!;
    return {
      externalId: issue.identifier,
      externalUrl: issue.url ?? null,
      title: issue.title,
      state: issue.state,
      updatedAt: issue.updatedAt ?? null,
    };
  });
}

export function scopeRealityError(error: unknown) {
  if (error instanceof ScopeRealityConflictError) {
    return NextResponse.json({ error: error.message, code: "REALITY_CONFLICT" }, { status: 409 });
  }
  if (error instanceof ScopeRealityInputError) {
    return NextResponse.json({ error: error.message, code: "INVALID_SCOPE_CHANGE" }, { status: 400 });
  }
  if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
    return NextResponse.json({ error: "That Scope object no longer exists." }, { status: 404 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Scope Reality write failed." },
    { status: 500 },
  );
}
