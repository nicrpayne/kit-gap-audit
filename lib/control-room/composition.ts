import type { ProjectPayload, SuiteScenario } from "@/lib/instrument/useProject";
import { composeScopeFeatures } from "@/lib/scope/features";
import { scenarioDisplayShape } from "@/lib/scenario/displayShape";
import { scenarioCapacityDisplay } from "@/lib/scenario/displayCapacity";

/** Dashboard summaries use Scope's exact reviewed feature model. This is
 * normalized load at current staffing, not additive elapsed project time. */
export function controlRoomComposition(data: ProjectPayload, scenario: SuiteScenario) {
  return data.scopes.map(scope => {
    const shape = scenarioDisplayShape(scope, scenario);
    const {capacity} = scenarioCapacityDisplay(data, scenario, scope.scopeId);
    const composition = composeScopeFeatures(shape.scenarioItems, scope.completedWork, shape.scenarioCapabilities,
      capacity, shape.proposalBypassed, scenario.estimateOverrideByItemId,
      [...scenario.draftFeatures,...shape.proposalDrafts], scenario.acceptedCandidateIds,
      scenario.knowledgeEstimateByCapabilityId, scenario.capabilityStaffingById);
    return {scopeId:scope.scopeId,id:scope.scopeId,name:scope.name,days:composition.loadDays,features:composition.engaged.length};
  });
}
