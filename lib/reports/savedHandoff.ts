import { isDecisionBriefV1 } from "./decisionBrief";
import { isBriefRecipeV1 } from "./composer";
import { reportComparison } from "./comparison";
import { buildInteractiveBriefBundle } from "./presentation";

type SavedRow = { id: string; mode: string | null; briefSnapshot: unknown; briefRecipe: unknown };

/** Only persisted rows enter this boundary. No current owner reads or fixtures. */
export function savedReportHandoff(rows: SavedRow[], selectedId: string, pair: boolean) {
  const selected = rows.find((row) => row.id === selectedId);
  if (!selected) throw new Error("Saved report not found.");
  const comparison = pair ? reportComparison(rows, selectedId) : null;
  if (pair && !comparison) throw new Error("A complete, same-baseline saved comparison is required.");
  const selectedRows = comparison ? [comparison.reality, comparison.scenario] : [selected];
  const reports = selectedRows.map((row) => {
    if (!isDecisionBriefV1(row.briefSnapshot) || !isBriefRecipeV1(row.briefRecipe)) {
      throw new Error("This historical report lacks a captured brief or recipe. It cannot be reconstructed from today's data.");
    }
    return { reportId: row.id, ...buildInteractiveBriefBundle(row.briefSnapshot, row.briefRecipe) };
  });
  return {
    version: "saved-report-handoff.v1" as const,
    comparisonId: comparison?.realityBrief.identity.comparisonId ?? null,
    snapshotOnly: true as const,
    disclosure: "PRIVATE PROJECT DATA — review names, original quotes and links before sharing. Not sanitized.",
    reports,
    handoffPrompt: [
      "Build a private interactive leadership Site from this saved-report-handoff.v1 bundle only.",
      "Each reports[] entry contains an immutable saved brief, its saved recipe and fingerprint. Never fetch live Signal data or substitute a fixture.",
      "If there are two reports, compare Reality and Scenario side by side, preserving the common baseline and every explicit assumption.",
      "Use progressive disclosure: outlook, scope, people, decisions, schedule and evidence where captured in the saved recipe. Render all captured schedule landmarks and date ranges as an accessible timeline, not only the next milestone.",
      "Keep targets, commitments, modeled outcomes and team confidence distinct. Preserve caveats, exact quotes and source locators without inventing attribution.",
      "Clearly label the result as an interactive frozen snapshot, not an automatically updating report or a calibrated prediction.",
      "Private project data is included. Review disclosure with the owner. Do not add analytics, credentials, live API calls or public access.",
      "Prepare a private preview and matching print/PDF view. Do not publish or deploy without explicit approval.",
    ].join("\n"),
  };
}

export type SavedReportHandoff = ReturnType<typeof savedReportHandoff>;
