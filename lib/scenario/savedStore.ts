import { Prisma, type SavedScenario } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPortfolioInputs } from "@/lib/forecast/compute";
import {
  buildSavedScenarioBaseline,
  compareSavedScenarioBaseline,
  parseSavedScenarioBaseline,
  parseSavedScenarioIdempotencyKey,
  parseSavedScenarioName,
  parseSavedScenarioPayload,
  SavedScenarioValidationError,
  savedScenarioRequestFingerprint,
  summarizeSavedScenarioLevers,
  unavailableSavedScenarioFreshness,
  type SavedScenarioBaselineV1,
  type SavedScenarioDetail,
  type SavedScenarioDetailEnvelope,
  type SavedScenarioFreshness,
  type SavedScenarioListEnvelope,
  type SavedScenarioPayloadV1,
  type SavedScenarioSummary,
} from "@/lib/scenario/saved";

export const SAVED_SCENARIO_APP_NAMESPACE = "signal" as const;
export const SAVED_SCENARIO_WORKSPACE_KEY = "default" as const;

const ARCHIVE_REASON_MAX_LENGTH = 500;

export class SavedScenarioConflictError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = "SavedScenarioConflictError";
  }
}

export class SavedScenarioNotFoundError extends Error {
  readonly status = 404;
  constructor() {
    super("Saved Scenario not found.");
    this.name = "SavedScenarioNotFoundError";
  }
}

export class SavedScenarioSourceUnavailableError extends Error {
  readonly status = 503;
  constructor(message: string) {
    super(message);
    this.name = "SavedScenarioSourceUnavailableError";
  }
}

interface CreateSavedScenarioInput {
  name: unknown;
  payload: unknown;
  baseline: unknown;
  idempotencyKey: unknown;
}

interface UpdateSavedScenarioInput {
  expectedRevision: unknown;
  idempotencyKey: unknown;
  name?: unknown;
  archived?: unknown;
  archiveReason?: unknown;
  payload?: unknown;
  baseline?: unknown;
}

interface ParsedCreateInput {
  name: string;
  normalizedName: string;
  payload: SavedScenarioPayloadV1;
  baseline: SavedScenarioBaselineV1;
  idempotencyKey: string;
  fingerprint: string;
}

interface ParsedUpdateInput {
  expectedRevision: number;
  idempotencyKey: string;
  name?: string;
  normalizedName?: string;
  archived?: boolean;
  archiveReason?: string | null;
  payload?: SavedScenarioPayloadV1;
  baseline?: SavedScenarioBaselineV1;
  fingerprint: string;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function persistedPayload(row: SavedScenario): SavedScenarioPayloadV1 {
  return parseSavedScenarioPayload(row.payload);
}

function persistedBaseline(row: SavedScenario): SavedScenarioBaselineV1 {
  return parseSavedScenarioBaseline(row.baseline);
}

async function currentBaseline(): Promise<SavedScenarioBaselineV1> {
  const portfolio = await savedScenarioPortfolioReader();
  return buildSavedScenarioBaseline(portfolio);
}

type SavedScenarioPortfolioReader = () => Promise<Parameters<typeof buildSavedScenarioBaseline>[0]>;
let savedScenarioPortfolioReader: SavedScenarioPortfolioReader = buildPortfolioInputs;

/** Local route-handler proof seam. Production callers always use
 * buildPortfolioInputs; the override is process-local, serial, and rejected
 * in a production runtime so no request can choose its own Reality basis. */
export async function withSavedScenarioPortfolioReaderForProof<T>(
  reader: SavedScenarioPortfolioReader,
  work: () => Promise<T>,
): Promise<T> {
  if (process.env.NODE_ENV === "production") throw new Error("Saved Scenario proof fixtures are disabled in production.");
  const previous = savedScenarioPortfolioReader;
  savedScenarioPortfolioReader = reader;
  try { return await work(); }
  finally { savedScenarioPortfolioReader = previous; }
}

async function writeBaselineOrThrow(saved: SavedScenarioBaselineV1): Promise<SavedScenarioBaselineV1> {
  let current: SavedScenarioBaselineV1;
  try {
    current = await currentBaseline();
  } catch (error) {
    throw new SavedScenarioSourceUnavailableError(
      `Current Reality could not be read, so this Scenario was not saved: ${error instanceof Error ? error.message : "unknown source error"}`,
    );
  }
  const freshness = compareSavedScenarioBaseline(saved, current);
  if (freshness.state === "stale") {
    throw new SavedScenarioConflictError(
      "Reality changed after this Scenario was staged. Refresh Reality, review every lever, then explicitly save the reviewed Scenario; it was not silently rebased.",
    );
  }
  return current;
}

async function readFreshness(): Promise<
  { current: SavedScenarioBaselineV1; error: null } |
  { current: null; error: SavedScenarioFreshness }
> {
  try {
    return { current: await currentBaseline(), error: null };
  } catch (error) {
    return { current: null, error: unavailableSavedScenarioFreshness(error) };
  }
}

function freshnessFor(
  baseline: SavedScenarioBaselineV1,
  read: Awaited<ReturnType<typeof readFreshness>>,
): SavedScenarioFreshness {
  return read.current ? compareSavedScenarioBaseline(baseline, read.current) : read.error;
}

function summaryFor(
  row: SavedScenario,
  read: Awaited<ReturnType<typeof readFreshness>>,
): SavedScenarioSummary {
  const payload = persistedPayload(row);
  const baseline = persistedBaseline(row);
  if (row.status !== "active" && row.status !== "archived") {
    throw new Error(`Saved Scenario ${row.id} has unsupported status ${row.status}.`);
  }
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    revision: row.revision,
    baseline,
    freshness: freshnessFor(baseline, read),
    levers: summarizeSavedScenarioLevers(payload),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    archiveReason: row.archiveReason,
  };
}

function detailFor(
  row: SavedScenario,
  read: Awaited<ReturnType<typeof readFreshness>>,
): SavedScenarioDetail {
  return { ...summaryFor(row, read), payload: persistedPayload(row) };
}

async function parseCreate(input: CreateSavedScenarioInput): Promise<ParsedCreateInput> {
  const { name, normalizedName } = parseSavedScenarioName(input.name);
  const payload = parseSavedScenarioPayload(input.payload);
  const baseline = parseSavedScenarioBaseline(input.baseline);
  const idempotencyKey = parseSavedScenarioIdempotencyKey(input.idempotencyKey);
  return {
    name,
    normalizedName,
    payload,
    baseline,
    idempotencyKey,
    fingerprint: await savedScenarioRequestFingerprint({ operation: "create", name, normalizedName, payload, baseline }),
  };
}

async function parseUpdate(input: UpdateSavedScenarioInput): Promise<ParsedUpdateInput> {
  if (!Number.isInteger(input.expectedRevision) || (input.expectedRevision as number) < 1) {
    throw new SavedScenarioValidationError("expectedRevision is required and must be at least 1.");
  }
  const idempotencyKey = parseSavedScenarioIdempotencyKey(input.idempotencyKey);
  const parsed: Omit<ParsedUpdateInput, "fingerprint"> = {
    expectedRevision: input.expectedRevision as number,
    idempotencyKey,
  };
  if (input.name !== undefined) {
    const name = parseSavedScenarioName(input.name);
    parsed.name = name.name;
    parsed.normalizedName = name.normalizedName;
  }
  if (input.archived !== undefined) {
    if (typeof input.archived !== "boolean") throw new SavedScenarioValidationError("archived must be true or false.");
    parsed.archived = input.archived;
    if (input.archiveReason !== undefined) {
      if (input.archiveReason !== null && typeof input.archiveReason !== "string") {
        throw new SavedScenarioValidationError("archiveReason must be text or null.");
      }
      const reason = typeof input.archiveReason === "string" ? input.archiveReason.trim() : null;
      if (reason && reason.length > ARCHIVE_REASON_MAX_LENGTH) {
        throw new SavedScenarioValidationError(`archiveReason must be at most ${ARCHIVE_REASON_MAX_LENGTH} characters.`);
      }
      parsed.archiveReason = reason || null;
    }
  } else if (input.archiveReason !== undefined) {
    throw new SavedScenarioValidationError("archiveReason can only be supplied with archived.");
  }
  if ((input.payload === undefined) !== (input.baseline === undefined)) {
    throw new SavedScenarioValidationError("payload and baseline must be replaced together.");
  }
  if (input.payload !== undefined) {
    parsed.payload = parseSavedScenarioPayload(input.payload);
    parsed.baseline = parseSavedScenarioBaseline(input.baseline);
  }
  if (parsed.name === undefined && parsed.archived === undefined && parsed.payload === undefined) {
    throw new SavedScenarioValidationError("Rename, archive/unarchive, or provide a reviewed payload and baseline.");
  }
  return {
    ...parsed,
    fingerprint: await savedScenarioRequestFingerprint({
      operation: "update",
      expectedRevision: parsed.expectedRevision,
      name: parsed.name,
      normalizedName: parsed.normalizedName,
      archived: parsed.archived,
      archiveReason: parsed.archiveReason,
      payload: parsed.payload,
      baseline: parsed.baseline,
    }),
  };
}

function verifyIdempotency(
  mutation: { operation: string; requestFingerprint: string; scenarioId: string },
  operation: "create" | "update",
  fingerprint: string,
  scenarioId?: string,
) {
  if (
    mutation.operation !== operation ||
    mutation.requestFingerprint !== fingerprint ||
    (scenarioId !== undefined && mutation.scenarioId !== scenarioId)
  ) {
    throw new SavedScenarioConflictError("This idempotencyKey was already used for a different Saved Scenario request.");
  }
}

async function replayIfPresent(
  idempotencyKey: string,
  operation: "create" | "update",
  fingerprint: string,
  scenarioId?: string,
): Promise<SavedScenario | null> {
  const mutation = await prisma.savedScenarioMutation.findUnique({
    where: {
      appNamespace_workspaceKey_idempotencyKey: {
        appNamespace: SAVED_SCENARIO_APP_NAMESPACE,
        workspaceKey: SAVED_SCENARIO_WORKSPACE_KEY,
        idempotencyKey,
      },
    },
  });
  if (!mutation) return null;
  verifyIdempotency(mutation, operation, fingerprint, scenarioId);
  const row = await prisma.savedScenario.findFirst({
    where: {
      id: mutation.scenarioId,
      appNamespace: SAVED_SCENARIO_APP_NAMESPACE,
      workspaceKey: SAVED_SCENARIO_WORKSPACE_KEY,
    },
  });
  if (!row) throw new Error("Saved Scenario idempotency record is orphaned.");
  return row;
}

export async function listSavedScenarios(status: "active" | "archived" | "all" = "active"): Promise<SavedScenarioListEnvelope> {
  const [rows, freshness] = await Promise.all([
    prisma.savedScenario.findMany({
      where: {
        appNamespace: SAVED_SCENARIO_APP_NAMESPACE,
        workspaceKey: SAVED_SCENARIO_WORKSPACE_KEY,
        ...(status === "all" ? {} : { status }),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    }),
    readFreshness(),
  ]);
  return {
    scenarios: rows.map((row) => summaryFor(row, freshness)),
    freshnessWarning: freshness.error?.state === "unavailable" ? freshness.error.reason : null,
  };
}

export async function getSavedScenario(id: string): Promise<SavedScenarioDetailEnvelope> {
  const row = await prisma.savedScenario.findFirst({
    where: { id, appNamespace: SAVED_SCENARIO_APP_NAMESPACE, workspaceKey: SAVED_SCENARIO_WORKSPACE_KEY },
  });
  if (!row) throw new SavedScenarioNotFoundError();
  return { scenario: detailFor(row, await readFreshness()) };
}

export async function createSavedScenario(input: CreateSavedScenarioInput): Promise<SavedScenarioDetailEnvelope> {
  const parsed = await parseCreate(input);
  const replay = await replayIfPresent(parsed.idempotencyKey, "create", parsed.fingerprint);
  if (replay) return { scenario: detailFor(replay, await readFreshness()), reused: true };

  await writeBaselineOrThrow(parsed.baseline);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const existingMutation = await tx.savedScenarioMutation.findUnique({
          where: {
            appNamespace_workspaceKey_idempotencyKey: {
              appNamespace: SAVED_SCENARIO_APP_NAMESPACE,
              workspaceKey: SAVED_SCENARIO_WORKSPACE_KEY,
              idempotencyKey: parsed.idempotencyKey,
            },
          },
        });
        if (existingMutation) {
          verifyIdempotency(existingMutation, "create", parsed.fingerprint);
          const existing = await tx.savedScenario.findUnique({ where: { id: existingMutation.scenarioId } });
          if (!existing) throw new Error("Saved Scenario idempotency record is orphaned.");
          return { row: existing, reused: true };
        }
        const row = await tx.savedScenario.create({
          data: {
            appNamespace: SAVED_SCENARIO_APP_NAMESPACE,
            workspaceKey: SAVED_SCENARIO_WORKSPACE_KEY,
            name: parsed.name,
            normalizedName: parsed.normalizedName,
            payload: json(parsed.payload),
            baseline: json(parsed.baseline),
          },
        });
        await tx.savedScenarioMutation.create({
          data: {
            appNamespace: SAVED_SCENARIO_APP_NAMESPACE,
            workspaceKey: SAVED_SCENARIO_WORKSPACE_KEY,
            idempotencyKey: parsed.idempotencyKey,
            scenarioId: row.id,
            operation: "create",
            requestFingerprint: parsed.fingerprint,
            resultingRevision: row.revision,
          },
        });
        return { row, reused: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return { scenario: detailFor(result.row, { current: parsed.baseline, error: null }), reused: result.reused };
    } catch (error) {
      if (error instanceof SavedScenarioConflictError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
        const replayAfterConflict = await replayIfPresent(parsed.idempotencyKey, "create", parsed.fingerprint);
        if (replayAfterConflict) return { scenario: detailFor(replayAfterConflict, await readFreshness()), reused: true };
        const duplicate = await prisma.savedScenario.findFirst({
          where: {
            appNamespace: SAVED_SCENARIO_APP_NAMESPACE,
            workspaceKey: SAVED_SCENARIO_WORKSPACE_KEY,
            normalizedName: parsed.normalizedName,
          },
          select: { id: true },
        });
        if (duplicate) throw new SavedScenarioConflictError(`A Saved Scenario named "${parsed.name}" already exists.`);
        if (attempt < 2) continue;
      }
      throw error;
    }
  }
  throw new SavedScenarioConflictError("Saved Scenario could not be created after concurrent updates.");
}

export async function updateSavedScenario(id: string, input: UpdateSavedScenarioInput): Promise<SavedScenarioDetailEnvelope> {
  const parsed = await parseUpdate(input);
  const replay = await replayIfPresent(parsed.idempotencyKey, "update", parsed.fingerprint, id);
  if (replay) return { scenario: detailFor(replay, await readFreshness()), reused: true };

  if (parsed.baseline) await writeBaselineOrThrow(parsed.baseline);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const existingMutation = await tx.savedScenarioMutation.findUnique({
          where: {
            appNamespace_workspaceKey_idempotencyKey: {
              appNamespace: SAVED_SCENARIO_APP_NAMESPACE,
              workspaceKey: SAVED_SCENARIO_WORKSPACE_KEY,
              idempotencyKey: parsed.idempotencyKey,
            },
          },
        });
        if (existingMutation) {
          verifyIdempotency(existingMutation, "update", parsed.fingerprint, id);
          const existing = await tx.savedScenario.findUnique({ where: { id } });
          if (!existing) throw new SavedScenarioNotFoundError();
          return { row: existing, reused: true };
        }

        const current = await tx.savedScenario.findFirst({
          where: { id, appNamespace: SAVED_SCENARIO_APP_NAMESPACE, workspaceKey: SAVED_SCENARIO_WORKSPACE_KEY },
        });
        if (!current) throw new SavedScenarioNotFoundError();
        if (current.revision !== parsed.expectedRevision) {
          throw new SavedScenarioConflictError(
            `Saved Scenario changed: expected revision ${parsed.expectedRevision}, current revision ${current.revision}. Reload before retrying.`,
          );
        }

        const nextStatus = parsed.archived === undefined ? current.status : parsed.archived ? "archived" : "active";
        const nextName = parsed.name ?? current.name;
        const nextNormalizedName = parsed.normalizedName ?? current.normalizedName;
        const nextArchiveReason = parsed.archived === undefined
          ? current.archiveReason
          : parsed.archived
            ? parsed.archiveReason ?? null
            : null;
        const changed =
          nextName !== current.name ||
          nextStatus !== current.status ||
          nextArchiveReason !== current.archiveReason ||
          parsed.payload !== undefined;

        let row = current;
        if (changed) {
          const updated = await tx.savedScenario.updateMany({
            where: {
              id,
              appNamespace: SAVED_SCENARIO_APP_NAMESPACE,
              workspaceKey: SAVED_SCENARIO_WORKSPACE_KEY,
              revision: parsed.expectedRevision,
            },
            data: {
              name: nextName,
              normalizedName: nextNormalizedName,
              status: nextStatus,
              archiveReason: nextArchiveReason,
              ...(parsed.archived === undefined ? {} : { archivedAt: parsed.archived ? current.archivedAt ?? new Date() : null }),
              ...(parsed.payload ? { payload: json(parsed.payload), baseline: json(parsed.baseline!) } : {}),
              revision: { increment: 1 },
            },
          });
          if (updated.count !== 1) throw new SavedScenarioConflictError("Saved Scenario changed while this edit was being saved. Reload before retrying.");
          row = (await tx.savedScenario.findUnique({ where: { id } }))!;
        }
        await tx.savedScenarioMutation.create({
          data: {
            appNamespace: SAVED_SCENARIO_APP_NAMESPACE,
            workspaceKey: SAVED_SCENARIO_WORKSPACE_KEY,
            idempotencyKey: parsed.idempotencyKey,
            scenarioId: id,
            operation: "update",
            requestFingerprint: parsed.fingerprint,
            resultingRevision: row.revision,
          },
        });
        return { row, reused: !changed };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      const freshness = parsed.baseline ? { current: parsed.baseline, error: null } as const : await readFreshness();
      return { scenario: detailFor(result.row, freshness), reused: result.reused };
    } catch (error) {
      if (error instanceof SavedScenarioConflictError || error instanceof SavedScenarioNotFoundError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
        const replayAfterConflict = await replayIfPresent(parsed.idempotencyKey, "update", parsed.fingerprint, id);
        if (replayAfterConflict) return { scenario: detailFor(replayAfterConflict, await readFreshness()), reused: true };
        if (parsed.normalizedName) {
          const duplicate = await prisma.savedScenario.findFirst({
            where: {
              appNamespace: SAVED_SCENARIO_APP_NAMESPACE,
              workspaceKey: SAVED_SCENARIO_WORKSPACE_KEY,
              normalizedName: parsed.normalizedName,
              id: { not: id },
            },
            select: { id: true },
          });
          if (duplicate) throw new SavedScenarioConflictError(`A Saved Scenario named "${parsed.name}" already exists.`);
        }
        if (attempt < 2) continue;
      }
      throw error;
    }
  }
  throw new SavedScenarioConflictError("Saved Scenario could not be updated after concurrent updates.");
}
