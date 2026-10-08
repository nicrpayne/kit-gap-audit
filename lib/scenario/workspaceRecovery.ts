import {
  parseSavedScenarioBaseline,
  parseSavedScenarioPayload,
  type SavedScenarioBaselineV1,
  type SavedScenarioPayloadV1,
} from "@/lib/scenario/saved";

export const SCENARIO_DRAFT_STORAGE_KEY = "signal.scenario-tab-draft.v1";
export const SCENARIO_PENDING_MUTATION_KEY = "signal.scenario-save-attempt.v1";

export const RECOVERED_DRAFT_VERIFICATION_ERROR =
  "Checking this recovered Scenario against current project inputs…";

export interface WorkspaceSavedScenarioLink {
  id: string;
  name: string;
  revision: number;
}

export interface WorkspaceDraftV1 {
  version: 1;
  payload: SavedScenarioPayloadV1;
  baseline: SavedScenarioBaselineV1;
  saved: WorkspaceSavedScenarioLink | null;
  dirty: boolean;
  inputVerificationError: string | null;
}

export interface PendingScenarioMutation {
  signature: string;
  id: string;
}

type SavedReplyDisposition = "ignore" | "attach-clean" | "attach-dirty" | "detach-archived";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function savedLink(value: unknown): WorkspaceSavedScenarioLink | null {
  if (value === null || value === undefined) return null;
  const row = record(value, "Saved Scenario recovery link");
  if (
    typeof row.id !== "string" || !row.id ||
    typeof row.name !== "string" || !row.name ||
    !Number.isInteger(row.revision) || (row.revision as number) < 1
  ) {
    throw new Error("Saved Scenario recovery link is invalid.");
  }
  return { id: row.id, name: row.name, revision: row.revision as number };
}

/** Encode only the state required to recover one tab's hypothetical. */
export function encodeWorkspaceDraft(value: Omit<WorkspaceDraftV1, "version">): string {
  return JSON.stringify({ version: 1, ...value } satisfies WorkspaceDraftV1);
}

/**
 * Decode a tab draft fail-closed. Even a draft saved after a successful input
 * check must be verified again after document reload: the project may have
 * changed while this JavaScript realm was absent.
 */
export function decodeWorkspaceDraft(raw: string): WorkspaceDraftV1 {
  const value = record(JSON.parse(raw), "Scenario recovery copy");
  if (value.version !== 1) throw new Error("Unsupported recovery version.");
  const priorVerificationError = typeof value.inputVerificationError === "string" && value.inputVerificationError.trim()
    ? value.inputVerificationError
    : RECOVERED_DRAFT_VERIFICATION_ERROR;
  return {
    version: 1,
    payload: parseSavedScenarioPayload(value.payload),
    baseline: parseSavedScenarioBaseline(value.baseline),
    saved: savedLink(value.saved),
    dirty: value.dirty !== false,
    inputVerificationError: priorVerificationError,
  };
}

function validPending(value: unknown): PendingScenarioMutation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.signature !== "string" || !row.signature || typeof row.id !== "string" || !row.id) return null;
  return { signature: row.signature, id: row.id };
}

/** Select the same idempotency key after an uncertain response or reload. */
export function resolvePendingScenarioMutation({
  signature,
  current,
  storedRaw,
  createId,
}: {
  signature: string;
  current: PendingScenarioMutation | null;
  storedRaw: string | null;
  createId: () => string;
}): PendingScenarioMutation {
  let stored: PendingScenarioMutation | null = null;
  try { stored = storedRaw ? validPending(JSON.parse(storedRaw)) : null; } catch { /* Ignore unreadable optional retry state. */ }
  if (stored?.signature === signature) return stored;
  if (current?.signature === signature) return current;
  return { signature, id: createId() };
}

export function encodePendingScenarioMutation(value: PendingScenarioMutation): string {
  return JSON.stringify(value);
}

/** Decide whether an asynchronous save reply still belongs to this draft. */
export function savedScenarioReplyDisposition({
  requestGeneration,
  currentGeneration,
  savedPayloadSignature,
  currentPayloadSignature,
  responseStatus,
}: {
  requestGeneration: number;
  currentGeneration: number;
  savedPayloadSignature: string;
  currentPayloadSignature: string;
  responseStatus: "active" | "archived";
}): SavedReplyDisposition {
  if (requestGeneration !== currentGeneration) return "ignore";
  if (responseStatus === "archived") return "detach-archived";
  return savedPayloadSignature === currentPayloadSignature ? "attach-clean" : "attach-dirty";
}

/** Reconcile the mutation receipt immediately; a later list refresh is optional. */
export function upsertScenarioMutationResult<T extends { id: string }>(rows: T[], detail: T): T[] {
  return [detail, ...rows.filter((row) => row.id !== detail.id)];
}
