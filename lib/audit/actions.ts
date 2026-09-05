// WHAT A HUMAN CAN DO ABOUT A FINDING, and what it would mean.
//
// THE LAW THIS MODULE EXISTS TO HOLD:
//
//   A FINDING IS NOT REALITY. Accepting one never "accepts the finding into
//   Reality" — there is nothing in the schema such a phrase could write to.
//   What a human can do is create the REAL OBJECT the finding is evidence
//   for (a Decision, a tracked piece of work), or record a disposition on
//   the finding itself (resolved, dismissed). Those are different writes to
//   different tables, and the console names whichever one it is about to do.
//
// This is why there is no generic "Accept into Reality" button anywhere in
// Audit. Every primary action below names its own consequence.
//
// Each action states, in its own words:
//   - what Reality says now              (A · CURRENT)
//   - what Reality would say afterwards  (B · CANDIDATE, never persisted)
//   - what it will actually write
//   - what it will NOT write
//
// The last one matters most. "Opening a decision does not move a date" is a
// real product law (an open, ungated Decision has no forecast effect), and
// saying so at the moment of acceptance is what stops the instrument from
// implying a consequence it does not have.

import type { TruthFinding } from "./truth";

export type ActionId =
  | "open_decision"
  | "add_missing_work"
  | "record_resolution"
  | "correct"
  | "need_more_evidence"
  | "reject";

export interface PrimaryAction {
  id: ActionId;
  /** The button's words. Names the consequence, never the finding. */
  label: string;
  /** The row this will create or change, in plain terms. */
  writes: string;
  /** What it deliberately does NOT do. Shown next to the button. */
  doesNotWrite: string;
  /** Whether the write needs a second confirmation step of its own (the
      Linear ticket route returns a preview before it will file anything). */
  previewFirst: boolean;
  /** Free text the action requires from the person before it can run. */
  requires: { field: "resolution" | "reason"; label: string; placeholder: string } | null;
}

export interface CandidateReality {
  /** What accepted Reality currently says about this. */
  current: string;
  /** What it would say if the correction were accepted. NEVER persisted. */
  candidate: string;
  /** The truthful delivery consequence, or an honest statement that there
      is none. Never a number this app cannot compute. */
  consequence: string;
}

/**
 * The one primary action a Finding offers.
 *
 * Chosen from `type` and the `blocking`/`owner` columns — never from a
 * category invented for the UI. A type with no better answer falls through
 * to recording how it resolved, which is a real disposition rather than a
 * pretend Reality write.
 */
export function primaryActionFor(f: TruthFinding): PrimaryAction {
  switch (f.type) {
    case "decision":
      return {
        id: "open_decision",
        label: "Open the decision",
        writes: "Creates a Decision for this Scope, open and unowned-by-default, linked back to this finding.",
        // THE PRODUCT LAW, stated at the moment it matters.
        doesNotWrite:
          "Does not connect it to delivery. An open decision has no forecast effect until someone declares a gate.",
        previewFirst: false,
        requires: null,
      };
    case "missing_work":
      return {
        id: "add_missing_work",
        label: "Add the missing work",
        writes: "Composes a Linear issue from this finding and shows it to you before anything is filed.",
        doesNotWrite:
          "Does not file it yet. Nothing reaches Linear until you confirm the exact payload on screen.",
        previewFirst: true,
        requires: null,
      };
    default:
      return {
        id: "record_resolution",
        label: f.type === "contradiction" ? "Record which source is right" : "Record how this resolves",
        writes: "Marks the finding resolved and stores what you wrote as its resolution.",
        doesNotWrite:
          "Does not change any Scope, Decision or ticket. This records a disposition on the finding only.",
        previewFirst: false,
        requires: {
          field: "resolution",
          label: "What resolves it",
          placeholder:
            f.type === "contradiction"
              ? "Which source is authoritative, and why…"
              : "What was done, or what makes this a non-issue…",
        },
      };
  }
}

/** The secondary actions, identical for every Finding — they are
    dispositions on the finding, not statements about its subject. */
export function secondaryActionsFor(f: TruthFinding): PrimaryAction[] {
  return [
    {
      id: "correct",
      label: "Correct / edit",
      writes: "Lets you restate the finding before acting on it.",
      doesNotWrite: "Not yet implemented — see the Audit notes for the tranche this lands in.",
      previewFirst: false,
      requires: null,
    },
    {
      id: "need_more_evidence",
      label: "Need more evidence",
      // HONEST ABOUT ITS OWN LIMITS. The Finding model has no
      // "awaiting evidence" status, so this cannot persist one. It marks the
      // finding in THIS SESSION only, and the console says so on the button
      // rather than implying a durable state that does not exist.
      writes: "Marks it awaiting evidence for this session so you can move on.",
      doesNotWrite: "Not saved. Finding.status has no awaiting-evidence value; this is lost on reload.",
      previewFirst: false,
      requires: null,
    },
    {
      id: "reject",
      label: "Reject finding",
      writes: "Marks the finding dismissed with the reason you give.",
      doesNotWrite: `Does not change ${f.laneId === "linear" ? "any ticket" : "any project record"}. The finding is set aside, not acted on.`,
      previewFirst: false,
      requires: {
        field: "reason",
        label: "Why it is wrong",
        placeholder: "Why this is not a real gap…",
      },
    },
  ];
}

/**
 * A/B: what Reality says, and what it would say.
 *
 * B is a STATEMENT, not a simulation. Where a real forecast consequence can
 * be named truthfully it is named; where it cannot, this says there is none
 * or that it is not computed here — it never produces a delta it has not
 * measured.
 */
export function candidateRealityFor(f: TruthFinding, scopeName: string): CandidateReality {
  switch (f.type) {
    case "decision":
      return {
        current: f.owner
          ? `No open decision is recorded for this, though the audit read ${f.owner} as its likely owner.`
          : "No open decision is recorded for this question.",
        candidate: `${scopeName} carries an open decision: "${f.title}".`,
        // TRUE, AND THE POINT. This is the law made visible: the thing the
        // old model got wrong was letting "this is a decision" silently mean
        // "this delays delivery".
        consequence:
          "No delivery consequence. An open decision moves no date — only a declared gate does, and this creates none.",
      };
    case "missing_work":
      return {
        current: f.matchedIssues.length
          ? `Execution carries ${f.matchedIssues.join(", ")}, which the audit judged not to cover this.`
          : "No tracked work covers this.",
        candidate: `A Linear issue exists for "${f.title}", linked to this finding.`,
        consequence:
          "This finding has zero forecast effect on its own. Filing or attaching canonical work lets that work enter Reality once, through the delivery model.",
      };
    case "contradiction":
      return {
        current: "Both sources are recorded, and neither is marked authoritative.",
        candidate: `The finding is resolved with a note saying which source stands.`,
        consequence:
          "Resolving it records how the contradiction was handled. The Finding itself has no forecast effect and it writes nothing to either source.",
      };
    default:
      return {
        current: f.blocks
          ? `${f.blocks} is recorded as waiting, with no resolution stored.`
          : "The risk is recorded, with no resolution stored.",
        candidate: "The finding is resolved with a note saying how it was handled.",
        consequence:
          "Resolving it records how the risk was handled. The Finding itself has no forecast effect and it declares no gate.",
      };
  }
}
