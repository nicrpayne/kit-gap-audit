import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
function audit(flags) {
  const r = spawnSync('npm', ['audit', '--json', ...flags], {encoding: 'utf8', timeout: 60000});
  assert(!r.error && [0, 1].includes(r.status), 'Audit must complete; network errors are not a pass');
  const a = JSON.parse(r.stdout); assert(a.metadata && a.vulnerabilities && !a.error);
  return a;
}
assert.equal(audit(['--omit=dev']).metadata.vulnerabilities.total, 0, 'No known production dependency advisories permitted');
const all = audit([]);
assert.equal(all.metadata.vulnerabilities.total, 0, 'No known development dependency advisories permitted');
console.log(JSON.stringify({production: 'PASS: zero known advisories', development: 'PASS: zero known advisories', remaining: all.metadata.vulnerabilities, review: 'docs/DEPENDENCY-SECURITY-2026-11-06.md'}));
