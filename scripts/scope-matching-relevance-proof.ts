import assert from 'node:assert/strict';
import { compileScopeProposal } from '../lib/scope/proposal';
import { isBulkStageEligible } from '../lib/scope/proposalEligibility';
import { matchingCapability as cap, matchingIssue as issue, matchingRef as ref, matchingSnapshot as snapshot, scopeMatchingFixture } from './lib/scope-matching-fixture';

const checks: { name: string; status: string; error?: string }[] = [];
function check(name: string, run: () => void) { try { run(); checks.push({ name, status: 'PASS' }); } catch (e) { checks.push({ name, status: 'FAIL', error: String(e) }); } }
const input = scopeMatchingFixture();
const original = JSON.stringify(input);
const result = compileScopeProposal(input);
check('project name does not map notifications or roles into Quality', () => assert.deepEqual(result.items.find(i => i.targetCapabilityId === 'iTrack Quality')?.workItemIds, []));
check('Light/Dark review remains its own executable work', () => assert.equal(result.items.find(i => i.workItemIds.includes('TST-104'))?.title, 'Light/Dark mode review'));
check('other-project feature candidates stay out of the local review queue', () => assert(!result.items.some(i => /^JSA /.test(i.title))));
check('broad project/release evidence does not corroborate Quality', () => assert(!result.items.find(i => i.title === 'iTrack Quality')?.provenance.contextRefs.some(r => r.id === 'generic-release')));
check('every executable leaf remains represented exactly once', () => assert.deepEqual(result.items.flatMap(i => i.workItemIds).sort(), ['TST-101', 'TST-102', 'TST-103', 'TST-104', 'TST-201']));
check('unmatched groups stay reviewable and cannot be bulk staged', () => {
  for (const item of result.items.filter(i => i.workItemIds.length)) { assert.equal(item.action, 'create_capability'); assert.equal(item.confidence, 'low'); assert(!isBulkStageEligible({ ...item, id: item.candidateKey, status: 'suggested' })); }
});
check('compilation never mutates accepted inputs', () => assert.equal(JSON.stringify(input), original));
check('ordering remains deterministic', () => assert.equal(compileScopeProposal({ ...input, issues: [...input.issues].reverse(), capabilities: [...input.capabilities].reverse() }).fingerprint, result.fingerprint));

const run = (issues: ReturnType<typeof issue>[], capabilities: ReturnType<typeof cap>[], refs: ReturnType<typeof ref>[] = []) => compileScopeProposal({ includeTriage: false, activeReleaseNames: ['KIT iTrack V0 Beta'], issues, capabilities, snapshot: snapshot(refs) });
check('incidental Quality in a broad description cannot rename a notification cluster', () => {
  const parent = { ...issue('TST-300', 'iTrack notification engine'), description: 'Send alerts for injury and Quality incidents.' };
  const p = run([parent, issue('TST-301', 'Send alert', 'TST-300', parent.title)], [cap('iTrack Quality')]);
  assert.equal(p.items.find(i => i.workItemIds.includes('TST-301'))?.title, parent.title);
});
check('description overlap cannot merge two different feature identities', () => {
  const p = run([], [{ ...cap('iTrack Quality'), description: 'Notifications and approvals are reviewed at the same meeting.' }], [ref('notification-shape', 'iTrack notifications', 'Quality and approvals are reviewed at the same meeting.')]);
  assert.equal(p.items.length, 2);
});
check('genuine notification title match is retained', () => {
  const p = run([issue('TST-401', 'People are notified when an incident needs attention')], [cap('iTrack notifications')]);
  assert.deepEqual(p.items.find(i => i.targetCapabilityId === 'iTrack notifications')?.workItemIds, ['TST-401']);
});
check('explicit parent mapping remains a stronger supported identity', () => {
  const p = run([issue('TST-500', 'Release slice'), issue('TST-501', 'Implementation', 'TST-500', 'Release slice')], [cap('Incident capture')], [ref('direct', 'Incident capture', 'Reviewed parent mapping.', ['itrack'], { linearIssueIds: ['TST-500'] })]);
  assert.deepEqual(p.items.find(i => i.targetCapabilityId === 'Incident capture')?.workItemIds, ['TST-501']);
});
check('explicitly mapped cross-project work is not discarded by scope filtering', () => {
  const p = run([issue('TST-600', 'Shared service')], [], [ref('shared', 'JSA shared service', 'Explicit shared integration.', ['jsa'], { linearIssueIds: ['TST-600'] })]);
  assert.deepEqual(p.items.find(i => i.title === 'JSA shared service')?.workItemIds, ['TST-600']);
});
check('ambiguous named feature matches stay separate execution exceptions', () => {
  const p = run([issue('TST-700', 'Notifications')], [cap('In-app notifications'), cap('Email notifications')]);
  assert.equal(p.items.find(i => i.workItemIds.includes('TST-700'))?.reconciliationState, 'execution_exception');
});
check('accepted ownership cannot be silently transferred', () => {
  const p = run([issue('TST-800', 'Notifications')], [cap('iTrack notifications'), { ...cap('Later channels'), status: 'outside', workLinks: [{ externalId: 'TST-800', state: 'active' }] }]);
  assert(!p.items.find(i => i.targetCapabilityId === 'iTrack notifications')?.workItemIds.includes('TST-800'));
});
check('unknown and explicitly shared product context are preserved', () => {
  const p = run([], [], [
    ref('unknown', 'Mobile launcher', 'An unqualified shared launcher.', []),
    ref('shared-products', 'JSA and iTrack navigation', 'Shared navigation.', ['jsa', 'itrack']),
  ]);
  assert.equal(p.sourceWatermark.contextOtherProjectRefCount, 0);
  assert.equal(p.items.length, 2);
});
check('explicit project qualifier prevents same-name foreign feature matching', () => {
  const p = run([issue('TST-900', 'iTrack notifications')], [cap('JSA notifications')]);
  assert.deepEqual(p.items.find(i => i.targetCapabilityId === 'JSA notifications')?.workItemIds, []);
  assert.equal(p.items.find(i => i.workItemIds.includes('TST-900'))?.targetCapabilityId, null);
});
check('filtering records source counts without removing anything from Audit input', () => {
  assert.equal(result.sourceWatermark.contextOtherProjectRefCount, 2);
  assert.equal((input.snapshot.package as { intelligenceObjects: unknown[] }).intelligenceObjects.length, 4);
});
console.log(JSON.stringify({ checks, passed: checks.filter(c => c.status === 'PASS').length, failed: checks.filter(c => c.status === 'FAIL').length }, null, 2));
assert(checks.every(c => c.status === 'PASS'), 'Scope matching regression failures');
