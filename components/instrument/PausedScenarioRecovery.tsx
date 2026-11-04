"use client";

import { scenarioIsActive, useScenarioWorkspace } from "@/lib/instrument/useProject";
import SavedScenarios from "@/components/instrument/SavedScenarios";

export default function PausedScenarioRecovery() {
  const workspace = useScenarioWorkspace();
  if (scenarioIsActive(workspace.scenario) || !workspace.parkedDrafts.length) return null;
  return <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--i-border)] bg-[var(--i-panel)] px-4 py-2" role="status" data-shoot="paused-scenario-recovery">
    <span className="text-[12px] text-[var(--i-text-soft)]">Viewing Reality · your paused Scenario edits are kept in this tab.</span>
    <SavedScenarios triggerLabel={`Paused Scenarios (${workspace.parkedDrafts.length})`} />
  </div>;
}
