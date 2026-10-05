import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMPTY_SCENARIO, type ProjectScope, type ScopeWorkItem, type SuiteScenario } from '../lib/instrument/useProject';
import { evaluateForecastCoverage } from '../lib/forecast/coverage';
import { scenarioForecastCoverage } from '../lib/scenario/forecastCoverage';

const checks: string[] = [];
const check = (name: string, run: () => void) => { run(); checks.push(name); };
const empty = () => structuredClone(EMPTY_SCENARIO);
function capability(id: string, itemIds: string[], status = 'accepted'): ProjectScope['capabilities'][number] {
  return {
    id, name: id, description: null, status, revision: 1, sortOrder: 0, updatedAt: '2026-10-05', workLinkCount: itemIds.length,
    provenance: null, events: [], knowledgeEstimates: [], acceptedEstimate: null, estimateReview: null,
    workLinks: itemIds.map(externalId => ({ id: `link:${id}:${externalId}`, provider: 'linear', externalId, externalUrl: null, state: 'active' })),
  };
}
function scope(id: string, count: number, capabilities = [capability('future', [], 'outside')]): ProjectScope {
  const executionItems: ScopeWorkItem[] = Array.from({ length: count }, (_, i) => ({
    id: `${id}-${i + 1}`, label: `Controlled ticket ${i + 1}`, low: 1, likely: 3, high: 7, estimateSource: 'issue_placeholder',
    kind: 'ticket', state: 'Backlog', assignee: null, points: null, quote: null, rationale: null, parentIdentifier: null, parentTitle: null, projectName: id,
  }));
  // Other payload fields are not read by this pure coverage projection.
  return {
    scopeId: id, name: id, dependsOnScopeIds: [], items: [], executionItems, capabilities, executionState: 'configured', openShapeQuestions: [],
    forecastCoverage: evaluateForecastCoverage({ executionState: 'configured', issueIds: executionItems.map(i => i.id), capabilities, openShapeDecisionCount: 0 }),
  } as unknown as ProjectScope;
}
function selection(scopeId: string, itemIds: string[], overrides: Partial<SuiteScenario['scopeProposalSelections'][number]> = {}): SuiteScenario['scopeProposalSelections'][number] {
  return { scopeId, proposalId: 'proof', itemId: 'notification', title: 'Notification', description: null, sourceCapabilityId: null, sourceAlreadyLinkedItemIds: [], targetCapabilityId: null, expectedRevision: null, itemIds, releaseStatus: 'accepted', ...overrides };
}
const itrack = scope('itrack', 45);
const other = scope('other', 8);
const six = itrack.executionItems.slice(0, 6).map(i => i.id);
const scenario = empty(); scenario.scopeProposalSelections = [selection('itrack', six)];
const before = structuredClone([itrack, other]);
const project = (s: ProjectScope, state: SuiteScenario = empty()) => scenarioForecastCoverage([s], state, true).get(s.scopeId)!;

check('Reality is returned exactly; six staged links make 45 -> 39; reset restores 45', () => {
  assert.equal(scenarioForecastCoverage([itrack], empty(), false).get('itrack'), itrack.forecastCoverage);
  assert.equal(project(itrack, scenario).census.unmappedExecutionIssueCount, 39);
  assert.equal(project(itrack, scenario).census.modeledExecutionIssueCount, 6);
  assert.equal(project(itrack).census.unmappedExecutionIssueCount, 45);
});
check('Projection never mutates accepted inputs or leaks to another project', () => {
  const result = scenarioForecastCoverage([itrack, other], scenario, true);
  assert.equal(result.get('other')!.census.unmappedExecutionIssueCount, 8);
  assert.deepEqual([itrack, other], before);
});
check('Outside selection classifies without modeling; a draft is not a Reality write', () => {
  const s = empty(); s.scopeProposalSelections = [selection('itrack', six, { releaseStatus: 'outside' })];
  assert.equal(project(itrack, s).census.outsideExecutionIssueCount, 6);
  assert.equal(project(itrack, s).census.modeledExecutionIssueCount, 0);
  assert.equal(itrack.forecastCoverage.census.unmappedExecutionIssueCount, 45);
});
check('Open product-shape decisions survive resolving an unrelated modeled gate', () => {
  const s = structuredClone(itrack); s.openShapeQuestions = [{ id: 'shape', title: 'Boundary', status: 'open', rationale: null }];
  const state = empty(); state.resolvedGateIds.add('shape');
  assert.equal(project(s, state).census.openShapeDecisionCount, 1);
});
check('Missing, unavailable, stale, empty and review-required sources stay qualified', () => {
  for (const state of ['unavailable', 'not_configured', 'stale']) {
    const s = scope('ready', 2, [capability('feature', ['ready-1', 'ready-2'])]); s.executionState = state;
    assert.equal(project(s).canonicalForecast, false);
  }
  assert.equal(project(scope('empty', 0, [])).canonicalForecast, false);
  const s = scope('ready', 1, [capability('feature', ['ready-1'])]);
  s.capabilities[0].estimateReview = { status: 'review_required', estimate: null, publishable: false, reviewRequiredReason: 'Boundary changed' };
  assert(project(s).reasons.some(r => r.code === 'capability_estimate_review_required'));
});
check('Unmapped or absent accepted-capability links cannot become a complete claim', () => {
  for (const links of [[], ['old-missing-id']]) {
    const s = scope('ready', 1, [capability('feature', links)]);
    assert.equal(project(s).canonicalForecast, false);
  }
});
check('Deselection and link reassignment use the same displayed shape as Scope', () => {
  const s = scope('ready', 3, [capability('a', ['ready-1', 'ready-2']), capability('b', [], 'outside')]);
  const state = empty(); state.scopeProposalSelections = [selection('ready', ['ready-1'], { sourceCapabilityId: 'a', sourceAlreadyLinkedItemIds: ['ready-1', 'ready-2'], targetCapabilityId: 'a' })];
  assert.equal(project(s, state).census.modeledExecutionIssueCount, 1);
  state.scopeProposalSelections = [selection('ready', ['ready-1'], { sourceCapabilityId: 'a', sourceAlreadyLinkedItemIds: ['ready-1', 'ready-2'], targetCapabilityId: 'b', releaseStatus: 'outside' })];
  const c = project(s, state).census;
  assert.equal(c.modeledExecutionIssueCount, 1); assert.equal(c.outsideExecutionIssueCount, 1); assert.equal(c.unmappedExecutionIssueCount, 1);
});
check('Item overrides and drafted features remain scoped and do not invent capabilities', () => {
  const state = empty(); state.includedItemIds.add('itrack-1'); state.excludedItemIds.add('itrack-2'); state.includedItemIds.add('other-1');
  const c = project(itrack, state).census;
  assert.equal(c.modeledExecutionIssueCount, 1); assert.equal(c.outsideExecutionIssueCount, 1); assert.equal(c.acceptedCapabilityCount, 0);
  state.draftFeatures = [{ id: 'draft', name: 'Draft', intent: '', itemIds: ['itrack-3', 'other-3'] }];
  assert.equal(project(itrack, state).census.modeledExecutionIssueCount, 2);
});
check('An explicit inclusion does not double-count an outside ticket', () => {
  const s = scope('ready', 2, [capability('later', ['ready-1', 'ready-2'], 'outside')]);
  const state = empty(); state.includedItemIds.add('ready-1');
  const c = project(s, state).census; assert.equal(c.modeledExecutionIssueCount, 1); assert.equal(c.outsideExecutionIssueCount, 1);
});
check('Legacy all-Linear behavior survives a ticket exclusion', () => {
  const s = scope('legacy', 5, []); const state = empty(); state.excludedItemIds.add('legacy-1');
  const c = project(s, state).census; assert.equal(c.modeledExecutionIssueCount, 4); assert.equal(c.outsideExecutionIssueCount, 1); assert.equal(c.unmappedExecutionIssueCount, 0); assert.equal(c.acceptedCapabilityCount, 0);
});
check('Dependency coverage propagates transitively; unavailable and cyclic graphs fail closed', () => {
  const a = scope('a', 1, []), b = scope('b', 1, []), c = scope('c', 1);
  a.dependsOnScopeIds = ['b']; b.dependsOnScopeIds = ['c'];
  const result = scenarioForecastCoverage([a, b, c], empty(), true);
  assert.equal(result.get('a')!.canonicalForecast, false); assert.match(result.get('a')!.reason!, /b/);
  c.executionState = 'unavailable'; assert.equal(scenarioForecastCoverage([a, b, c], empty(), true).get('a')!.state, 'unavailable');
  assert.equal(scenarioForecastCoverage([a], empty(), true).get('a')!.state, 'unavailable');
  b.dependsOnScopeIds = ['a'];
  const cycle = scenarioForecastCoverage([a, b], empty(), true); assert.equal(cycle.get('a')!.state, 'unavailable'); assert.equal(cycle.get('b')!.state, 'unavailable');
});
check('A fully mapped hypothetical does not rewrite accepted Reality or report eligibility', () => {
  const state = empty(); state.scopeProposalSelections = [selection('itrack', itrack.executionItems.map(i => i.id))];
  assert.equal(project(itrack, state).canonicalForecast, true);
  assert.equal(itrack.forecastCoverage.canonicalForecast, false);
  const server = readFileSync('lib/reports/scenario.ts', 'utf8');
  assert.match(server, /if \(!target\.forecastCoverage\.canonicalForecast\)/);
  assert.match(server, /throw new ForecastCoverageIncompleteError\(target\.forecastCoverage\)/);
});
console.log(JSON.stringify({ passed: true, groups: checks.length, checks }, null, 2));
