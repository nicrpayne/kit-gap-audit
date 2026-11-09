import type { Prisma } from "@prisma/client";
import { normalizeSearchText } from "@/lib/audit/searchText";
import { serializableWrite } from "@/lib/db/serializable";
import { RequestValidationError } from "@/lib/http/json";
import type { BootstrapIdentityInput } from "./input";

export class BootstrapIdentityConflict extends RequestValidationError {
  constructor(
    readonly bootstrapId: string,
    name: string,
  ) {
    super(`A project setup named “${name}” already exists. Open that setup to continue.`, 409);
  }
}

async function assertNameAvailable(tx: Prisma.TransactionClient, name: string, exceptId?: string) {
  const existing = await tx.projectBootstrap.findFirst({
    where: {
      normalizedName: normalizeSearchText(name),
      status: { not: "archived" },
      id: { not: exceptId },
    },
    select: { id: true, canonicalName: true },
  });
  if (existing) throw new BootstrapIdentityConflict(existing.id, existing.canonicalName);
}

function withoutCanonicalAlias(name: string, aliases: string[]) {
  return aliases.filter((alias) => normalizeSearchText(alias) !== normalizeSearchText(name));
}

export function createBootstrap(input: BootstrapIdentityInput) {
  return serializableWrite(async (tx) => {
    await assertNameAvailable(tx, input.canonicalName);
    return tx.projectBootstrap.create({
      data: {
        ...input,
        normalizedName: normalizeSearchText(input.canonicalName),
        aliases: withoutCanonicalAlias(input.canonicalName, input.aliases),
        status: "draft",
      },
    });
  });
}

/** Serialize identity edits and package publication on the same parent row. */
export async function lockBootstrap(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "ProjectBootstrap" WHERE id = ${id} FOR UPDATE`;
}

export function editBootstrap(id: string, input: Partial<BootstrapIdentityInput>) {
  return serializableWrite(async (tx) => {
    await lockBootstrap(tx, id);
    const current = await tx.projectBootstrap.findUnique({
      where: { id },
      include: { activation: true },
    });
    if (!current) throw new RequestValidationError("Project setup not found.", 404);
    const name = input.canonicalName ?? current.canonicalName;
    const next = {
      canonicalName: name,
      aliases:
        input.aliases === undefined && input.canonicalName === undefined
          ? current.aliases
          : withoutCanonicalAlias(name, input.aliases ?? current.aliases),
      ownerHint: input.ownerHint === undefined ? current.ownerHint : input.ownerHint,
      sourceHints: input.sourceHints ?? current.sourceHints,
      searchExistingKnowledge: input.searchExistingKnowledge ?? current.searchExistingKnowledge,
    };
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter(
      (key) => JSON.stringify(next[key]) !== JSON.stringify(current[key]),
    );
    const { activation, ...row } = current;
    if (!changed.length) return row;
    if (activation || current.status === "activated" || current.status === "archived") {
      throw new RequestValidationError(
        "This setup is already activated or archived. Change the live project in Settings; its original evidence identity is retained.",
        409,
      );
    }
    if (changed.includes("canonicalName")) await assertNameAvailable(tx, name, id);

    // Retain the history and exact quotes, but never accept old-identity
    // proposals as if they had been collected for the newly edited identity.
    const invalidatedScans = await tx.bootstrapScanRun.findMany({
      where: { bootstrapId: id },
      select: { id: true },
    });
    await tx.bootstrapCandidate.updateMany({
      where: { bootstrapId: id, active: true },
      data: { active: false },
    });
    await tx.bootstrapScanRun.updateMany({
      where: { bootstrapId: id, status: { in: ["queued", "running"] } },
      data: { status: "stale", stage: "identity_changed", completedAt: new Date() },
    });
    await tx.bootstrapScanJob.updateMany({
      where: { bootstrapId: id, status: { in: ["pending", "claimed", "running"] } },
      data: {
        status: "stale",
        stage: "identity_changed",
        claimExpiresAt: null,
        completedAt: new Date(),
      },
    });
    const bootstrap = await tx.projectBootstrap.update({
      where: { id },
      data: {
        ...next,
        sourceHints: next.sourceHints as Prisma.InputJsonValue,
        normalizedName: normalizeSearchText(name),
        activePackageId: null,
        status: "draft",
        reviewRevision: { increment: 1 },
      },
    });
    await tx.bootstrapReviewEvent.create({
      data: {
        bootstrapId: id,
        action: "identity_changed",
        fromStatus: current.status,
        toStatus: "draft",
        detail: {
          changedFields: changed,
          previousPackageId: current.activePackageId,
          requiresRescan: true,
          invalidatedScanIds: invalidatedScans.map((scan) => scan.id),
        },
      },
    });
    return bootstrap;
  });
}
