import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateDerivedReads, recomputeDerivedReads } from "@/lib/audit/derivedRefresh";

export const CAPABILITY_STATUSES = ["accepted", "outside", "future"] as const;
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export interface OwnerWorkItem {
  externalId: string;
  externalUrl: string | null;
  title: string;
  state: string;
  updatedAt: string | null;
}

export class ScopeRealityConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeRealityConflictError";
  }
}

export class ScopeRealityInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeRealityInputError";
  }
}

const capabilityInclude = {
  workLinks: { orderBy: { createdAt: "asc" as const } },
  events: { orderBy: { createdAt: "desc" as const }, take: 30 },
} satisfies Prisma.CapabilityInclude;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function plain(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ScopeRealityInputError(`${label} is required.`);
  return value.trim();
}

function status(value: unknown): CapabilityStatus {
  if (!CAPABILITY_STATUSES.includes(value as CapabilityStatus)) {
    throw new ScopeRealityInputError("status must be accepted, outside, or future.");
  }
  return value as CapabilityStatus;
}

async function finish(scopeId: string, changed: boolean) {
  const derived = changed
    ? await recomputeDerivedReads(scopeId)
    : await prisma.projectDerivedState.findUnique({ where: { scopeId } });
  return { derived };
}

async function retrySerializable<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  throw new ScopeRealityConflictError("The Scope changed concurrently. Reload and try again.");
}

function assertionProvenance(input: { note?: string | null; evidence?: unknown[]; source?: string }) {
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  return {
    authority: "Scope",
    actor: "operator",
    source: input.source ?? "manual",
    assertion: evidence.length === 0 ? "Operator assertion · no evidence yet" : "Operator assertion · evidence attached",
    note: input.note?.trim() || null,
    evidence,
    acceptedAt: new Date().toISOString(),
  };
}

async function assertNoScopeDuplicate(
  tx: Prisma.TransactionClient,
  scopeId: string,
  name: string,
  exceptId?: string,
) {
  const duplicate = await tx.capability.findFirst({
    where: { scopeId, ...(exceptId ? { id: { not: exceptId } } : {}), name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) throw new ScopeRealityConflictError(`A capability named “${name}” already exists in this Scope.`);
}

async function assertWorkAvailable(
  tx: Prisma.TransactionClient,
  scopeId: string,
  capabilityId: string | null,
  work: OwnerWorkItem[],
) {
  if (!work.length) return;
  const ids = [...new Set(work.map((item) => required(item.externalId, "externalId")))];
  if (ids.length !== work.length) throw new ScopeRealityInputError("The same Linear item cannot be linked twice.");
  const collisions = await tx.capabilityWorkLink.findMany({
    where: {
      provider: "linear",
      externalId: { in: ids },
      capability: { scopeId, ...(capabilityId ? { id: { not: capabilityId } } : {}) },
      state: { in: ["active", "configured"] },
    },
    select: { externalId: true, capability: { select: { name: true } } },
  });
  if (collisions.length) {
    throw new ScopeRealityConflictError(
      `${collisions.map((item) => item.externalId).join(", ")} is already linked to ${collisions.map((item) => item.capability.name).join(", ")}. Unlink it there first.`,
    );
  }
}

async function createLinks(tx: Prisma.TransactionClient, capabilityId: string, work: OwnerWorkItem[]) {
  for (const item of work) {
    await tx.capabilityWorkLink.upsert({
      where: { capabilityId_provider_externalId: { capabilityId, provider: "linear", externalId: item.externalId } },
      create: {
        capabilityId,
        provider: "linear",
        externalId: item.externalId,
        externalUrl: item.externalUrl,
        state: "active",
        provenance: json({
          authority: "Linear",
          identity: item.externalId,
          title: item.title,
          stateAtLink: item.state,
          sourceUpdatedAt: item.updatedAt,
          reviewedBy: "operator",
          linkedAt: new Date().toISOString(),
        }),
      },
      update: { externalUrl: item.externalUrl, state: "active" },
    });
  }
}

export async function createCanonicalCapability(
  scopeId: string,
  input: {
    name: string;
    description?: string | null;
    status?: CapabilityStatus;
    note?: string | null;
    evidence?: unknown[];
    work?: OwnerWorkItem[];
    idempotencyKey: string;
  },
) {
  const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
  const name = required(input.name, "name");
  const work = input.work ?? [];
  const result = await retrySerializable(() => prisma.$transaction(async (tx) => {
    const prior = await tx.capabilityEvent.findUnique({ where: { idempotencyKey }, select: { capabilityId: true } });
    if (prior) return { capability: await tx.capability.findUniqueOrThrow({ where: { id: prior.capabilityId }, include: capabilityInclude }), created: false };
    await tx.scope.findUniqueOrThrow({ where: { id: scopeId }, select: { id: true } });
    await assertNoScopeDuplicate(tx, scopeId, name);
    await assertWorkAvailable(tx, scopeId, null, work);
    const max = await tx.capability.aggregate({ where: { scopeId, status: input.status ?? "accepted" }, _max: { sortOrder: true } });
    const capability = await tx.capability.create({ data: {
      scopeId,
      name,
      description: input.description?.trim() || null,
      status: status(input.status ?? "accepted"),
      sortOrder: (max._max.sortOrder ?? -1) + 1,
      provenance: json(assertionProvenance(input)),
    } });
    await createLinks(tx, capability.id, work);
    const after = await tx.capability.findUniqueOrThrow({ where: { id: capability.id }, include: { workLinks: true } });
    await tx.capabilityEvent.create({ data: {
      capabilityId: capability.id,
      scopeId,
      idempotencyKey,
      action: "create",
      afterState: json(plain(after)),
    } });
    await invalidateDerivedReads(tx, scopeId, `Capability ${capability.id} created in Scope.`);
    return { capability: await tx.capability.findUniqueOrThrow({ where: { id: capability.id }, include: capabilityInclude }), created: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  return { ...result, ...(await finish(scopeId, result.created)) };
}

export async function updateCanonicalCapability(
  capabilityId: string,
  input: {
    expectedRevision: number;
    name?: string;
    description?: string | null;
    status?: CapabilityStatus;
    note?: string | null;
    evidence?: unknown[];
    idempotencyKey: string;
  },
) {
  const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
  const result = await retrySerializable(() => prisma.$transaction(async (tx) => {
    const prior = await tx.capabilityEvent.findUnique({ where: { idempotencyKey }, select: { capabilityId: true } });
    if (prior) {
      const capability = await tx.capability.findUniqueOrThrow({ where: { id: prior.capabilityId }, include: capabilityInclude });
      return { capability, scopeId: capability.scopeId, changed: false };
    }
    const before = await tx.capability.findUniqueOrThrow({ where: { id: capabilityId }, include: { workLinks: true } });
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== before.revision) {
      throw new ScopeRealityConflictError(`This capability changed in another session (current revision ${before.revision}). Reload before saving.`);
    }
    const name = input.name === undefined ? before.name : required(input.name, "name");
    await assertNoScopeDuplicate(tx, before.scopeId, name, before.id);
    const updated = await tx.capability.updateMany({
      where: { id: capabilityId, revision: input.expectedRevision },
      data: {
        name,
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.status !== undefined ? { status: status(input.status) } : {}),
        ...(input.note !== undefined || input.evidence !== undefined ? { provenance: json(assertionProvenance(input)) } : {}),
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new ScopeRealityConflictError("This capability changed in another session. Reload before saving.");
    const after = await tx.capability.findUniqueOrThrow({ where: { id: capabilityId }, include: { workLinks: true } });
    await tx.capabilityEvent.create({ data: {
      capabilityId,
      scopeId: before.scopeId,
      idempotencyKey,
      action: before.status !== after.status ? "move_release_state" : "edit",
      beforeState: json(plain(before)),
      afterState: json(plain(after)),
    } });
    await invalidateDerivedReads(tx, before.scopeId, `Capability ${capabilityId} changed in Scope.`);
    return { capability: await tx.capability.findUniqueOrThrow({ where: { id: capabilityId }, include: capabilityInclude }), scopeId: before.scopeId, changed: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  return { capability: result.capability, changed: result.changed, ...(await finish(result.scopeId, result.changed)) };
}

export async function linkCanonicalWork(
  capabilityId: string,
  input: { expectedRevision: number; work: OwnerWorkItem[]; idempotencyKey: string },
) {
  const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
  if (!input.work.length) throw new ScopeRealityInputError("Choose at least one Linear item to link.");
  const result = await retrySerializable(() => prisma.$transaction(async (tx) => {
    const prior = await tx.capabilityEvent.findUnique({ where: { idempotencyKey }, select: { capabilityId: true } });
    if (prior) {
      const capability = await tx.capability.findUniqueOrThrow({ where: { id: prior.capabilityId }, include: capabilityInclude });
      return { capability, scopeId: capability.scopeId, changed: false };
    }
    const before = await tx.capability.findUniqueOrThrow({ where: { id: capabilityId }, include: { workLinks: true } });
    if (before.revision !== input.expectedRevision) throw new ScopeRealityConflictError(`This capability changed in another session (current revision ${before.revision}). Reload before saving.`);
    await assertWorkAvailable(tx, before.scopeId, capabilityId, input.work);
    const activeBefore = new Set(before.workLinks.filter((link) => ["active", "configured"].includes(link.state)).map((link) => link.externalId));
    const additions = input.work.filter((item) => !activeBefore.has(item.externalId));
    if (additions.length === 0) return { capability: await tx.capability.findUniqueOrThrow({ where: { id: capabilityId }, include: capabilityInclude }), scopeId: before.scopeId, changed: false };
    await createLinks(tx, capabilityId, additions);
    await tx.capability.update({ where: { id: capabilityId }, data: { revision: { increment: 1 } } });
    const after = await tx.capability.findUniqueOrThrow({ where: { id: capabilityId }, include: { workLinks: true } });
    await tx.capabilityEvent.create({ data: {
      capabilityId,
      scopeId: before.scopeId,
      idempotencyKey,
      action: "link_work",
      beforeState: json(plain(before)),
      afterState: json(plain(after)),
    } });
    await invalidateDerivedReads(tx, before.scopeId, `Linear work linked to Capability ${capabilityId}.`);
    return { capability: await tx.capability.findUniqueOrThrow({ where: { id: capabilityId }, include: capabilityInclude }), scopeId: before.scopeId, changed: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  return { capability: result.capability, changed: result.changed, ...(await finish(result.scopeId, result.changed)) };
}

export async function unlinkCanonicalWork(
  capabilityId: string,
  linkId: string,
  input: { expectedRevision: number; idempotencyKey: string },
) {
  const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
  const result = await retrySerializable(() => prisma.$transaction(async (tx) => {
    const prior = await tx.capabilityEvent.findUnique({ where: { idempotencyKey }, select: { capabilityId: true } });
    if (prior) {
      const capability = await tx.capability.findUniqueOrThrow({ where: { id: prior.capabilityId }, include: capabilityInclude });
      return { capability, scopeId: capability.scopeId, changed: false };
    }
    const before = await tx.capability.findUniqueOrThrow({ where: { id: capabilityId }, include: { workLinks: true } });
    if (before.revision !== input.expectedRevision) throw new ScopeRealityConflictError(`This capability changed in another session (current revision ${before.revision}). Reload before saving.`);
    const link = before.workLinks.find((item) => item.id === linkId);
    if (!link) throw new ScopeRealityInputError("That work link no longer exists.");
    await tx.capabilityWorkLink.delete({ where: { id: linkId } });
    await tx.capability.update({ where: { id: capabilityId }, data: { revision: { increment: 1 } } });
    const after = await tx.capability.findUniqueOrThrow({ where: { id: capabilityId }, include: { workLinks: true } });
    await tx.capabilityEvent.create({ data: {
      capabilityId,
      scopeId: before.scopeId,
      idempotencyKey,
      action: "unlink_work",
      beforeState: json(plain(before)),
      afterState: json(plain(after)),
    } });
    await invalidateDerivedReads(tx, before.scopeId, `Linear work unlinked from Capability ${capabilityId}.`);
    return { capability: await tx.capability.findUniqueOrThrow({ where: { id: capabilityId }, include: capabilityInclude }), scopeId: before.scopeId, changed: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  return { capability: result.capability, changed: result.changed, ...(await finish(result.scopeId, result.changed)) };
}
