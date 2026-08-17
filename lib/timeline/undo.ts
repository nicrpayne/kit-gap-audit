// UNDO, SCOPED TO WHAT TIMELINE ACTUALLY OWNS.
//
// Timeline can now retime, rehome, create and remove TimelineEvent rows,
// so a mistake is a real possibility and "⌘Z" is a real expectation. What
// it must NOT become is an application-wide undo architecture: a Report is
// a Report, a Linear completion is a live read, a Decision belongs to
// Decisions, and none of them acquire a rollback because Timeline learned
// to move its own rows.
//
// So this is deliberately a LOCAL COMMAND STACK, for this editing session
// only, over Timeline-owned rows only. Each entry carries the inverse of
// what was done, expressed as the same API calls a person could make by
// hand. Nothing is stored, nothing survives a reload, and nothing here can
// address a row Timeline does not own — there is no endpoint for one.
//
// The stack is bounded. An unbounded history of a canvas you are sketching
// on is a memory leak wearing a feature's clothes.

export const UNDO_LIMIT = 40;

/** What a Timeline-owned row looked like, in the shape the API takes. */
export interface PlanSnapshot {
  scopeId: string;
  title: string;
  date: string;
  endDate: string | null;
  temporalState: string;
  kind: string;
  note: string | null;
}

export type TimelineCommand =
  /** The row existed before and still does; only its timing/home changed. */
  | { kind: "retime"; id: string; before: Pick<PlanSnapshot, "scopeId" | "date" | "endDate">; after: Pick<PlanSnapshot, "scopeId" | "date" | "endDate">; label: string }
  /** The row did not exist before. Undo removes it. */
  | { kind: "create"; id: string; snapshot: PlanSnapshot; label: string }
  /** The row existed before and does not now. Undo puts it back. */
  | { kind: "delete"; id: string; snapshot: PlanSnapshot; label: string }
  /**
   * A candidate was taken out of Event Intake and placed on the score.
   *
   * ONE COMMAND, NOT TWO. Placing is a single act to the person doing it, so
   * it has to be a single act to ⌘Z — nobody should have to undo "create the
   * landmark" and then separately undo "accept the candidate". It is one
   * entry here, and the API makes it one operation at the other end too:
   * deleting an event that came from a candidate restores that candidate to
   * pending in the same transaction. So the inverse is still just a DELETE,
   * and this needs no transaction framework to sit on top of.
   *
   * `candidateId` is what redo re-accepts. The placement — scope, date, end,
   * state — is carried so redo puts it back exactly where it was, not back
   * where the source originally suggested.
   */
  | {
      kind: "place";
      id: string;
      candidateId: string;
      placement: { scopeId: string; date: string; endDate: string | null; temporalState: string };
      label: string;
    };

export interface UndoState {
  past: TimelineCommand[];
  future: TimelineCommand[];
}

export const EMPTY_UNDO: UndoState = { past: [], future: [] };

/** Record a command. Doing something new discards the redo branch, which is
    the behaviour every editor has and every person expects. */
export function record(state: UndoState, cmd: TimelineCommand): UndoState {
  const past = [...state.past, cmd];
  return { past: past.length > UNDO_LIMIT ? past.slice(past.length - UNDO_LIMIT) : past, future: [] };
}

export function undoTop(state: UndoState): { cmd: TimelineCommand | null; next: UndoState } {
  const cmd = state.past[state.past.length - 1] ?? null;
  if (!cmd) return { cmd: null, next: state };
  return { cmd, next: { past: state.past.slice(0, -1), future: [...state.future, cmd] } };
}

export function redoTop(state: UndoState): { cmd: TimelineCommand | null; next: UndoState } {
  const cmd = state.future[state.future.length - 1] ?? null;
  if (!cmd) return { cmd: null, next: state };
  return { cmd, next: { past: [...state.past, cmd], future: state.future.slice(0, -1) } };
}

/** A short description of what ⌘Z would reverse, for the affordance that
    says so. "Undo" alone makes a person guess. */
export function describe(cmd: TimelineCommand | null): string | null {
  if (!cmd) return null;
  return cmd.label;
}

/**
 * A row that comes BACK is a new row.
 *
 * Undoing a create deletes the row; redoing it creates one again, and the
 * database quite correctly gives it a fresh id. Every command still holding
 * the old id would then be addressing something that no longer exists — so
 * the whole stack is remapped the moment the id changes. Without this,
 * "create, move, undo, undo, redo, redo" silently stops working, which is
 * exactly the sequence a person performs while changing their mind.
 */
export function remapId(state: UndoState, oldId: string, newId: string): UndoState {
  const fix = (c: TimelineCommand): TimelineCommand => (c.id === oldId ? { ...c, id: newId } : c);
  return { past: state.past.map(fix), future: state.future.map(fix) };
}
