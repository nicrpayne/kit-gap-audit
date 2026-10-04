import type { LinearIssueSummary } from '../../lib/linear';
import type { ProposalCapability, ProposalSnapshot } from '../../lib/scope/proposal';

export const matchingIssue = (identifier: string, title: string, parentIdentifier: string | null = null, parentTitle: string | null = null): LinearIssueSummary => ({
  identifier, title, description: null, url: `https://linear.example/${identifier}`, state: 'Backlog', stateType: 'unstarted',
  estimate: null, assignee: null, labels: [], completedAt: null, updatedAt: '2026-10-04T12:00:00Z',
  parentIdentifier, parentTitle, projectName: 'KIT iTrack V0 Beta',
});
export const matchingCapability = (name: string): ProposalCapability => ({ id: name, name, description: null, status: 'accepted', revision: 1, workLinks: [] });
export const matchingRef = (id: string, capability: string | null, statement: string, scope: string[] = ['itrack'], fields: Record<string, unknown> = {}) => ({
  id, intelligenceType: 'Decision', isCurrent: true, status: 'decided', observedDate: '2026-10-03', scope,
  statement, evidenceRefs: [`evidence-${id}`], fields: { ...(capability ? { capability } : {}), ...fields },
});
export const matchingSnapshot = (objects: ReturnType<typeof matchingRef>[]): ProposalSnapshot => ({
  id: 'synthetic-matching-snapshot', packageId: 'synthetic-matching', packageVersion: '1.1', producer: 'test',
  contextHash: 'synthetic-matching', createdAt: new Date('2026-10-04T12:00:00Z'), completenessSummary: { status: 'complete' },
  package: { generatedAt: '2026-10-04T12:00:00Z', sources: [], evidence: [], intelligenceObjects: objects, derivedClaims: [] },
});
/** Fictional, minimal reproductions of observed matching failures; no private quotes. */
export function scopeMatchingFixture() {
  return {
    includeTriage: false,
    activeReleaseNames: ['KIT iTrack V0 Beta'],
    capabilities: [{ ...matchingCapability('iTrack Quality'), status: 'provision_only', description: 'Rev 1 provisions for Quality but does not build the Quality workflow.' }],
    issues: [
      matchingIssue('TST-100', 'iTrack notification engine'),
      matchingIssue('TST-101', 'Notify on submit', 'TST-100', 'iTrack notification engine'),
      matchingIssue('TST-102', 'Change who is notified', 'TST-100', 'iTrack notification engine'),
      matchingIssue('TST-103', 'Define the iTrack roles and permissions model'),
      matchingIssue('TST-104', 'Light/Dark mode review'),
      matchingIssue('TST-200', 'Submit an incident report'),
      matchingIssue('TST-201', 'Review and submit an incident', 'TST-200', 'Submit an incident report'),
    ],
    snapshot: matchingSnapshot([
      matchingRef('generic-release', null, 'The iTrack launch date is confirmed in scope for KIT iTrack V0 Beta.', ['itrack', 'release']),
      matchingRef('quality', 'iTrack Quality', 'Quality workflow is provision only.', ['itrack', 'quality']),
      matchingRef('jsa-approval', 'JSA review and approval workflow', 'The JSA approval workflow must ship in KIT JSA V1.', ['jsa', 'approval']),
      matchingRef('jsa-notify', 'JSA notifications', 'JSA notifications must ship in KIT JSA V1.', ['jsa', 'notifications']),
    ]),
  };
}
