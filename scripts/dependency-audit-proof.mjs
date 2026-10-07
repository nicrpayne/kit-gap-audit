import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
function audit(flags) {
  const r = spawnSync('npm', ['audit', '--json', ...flags], {encoding: 'utf8', timeout: 60000});
  assert(!r.error && [0, 1].includes(r.status), 'Audit must complete; network errors are not a pass');
  const a = JSON.parse(r.stdout); assert(a.metadata && a.vulnerabilities && !a.error);
  return a;
}
assert.equal(audit(['--omit=dev']).metadata.vulnerabilities.total, 0, 'No known production dependency advisories permitted');
const all = audit([]);
const allowed = new Set(['@next/eslint-plugin-next', 'braces', 'chokidar', 'eslint-config-next', 'fast-glob', 'micromatch', 'tailwindcss']);
for (const [name, finding] of Object.entries(all.vulnerabilities)) {
  assert(allowed.has(name), `Unreviewed advisory: ${name}`);
  assert(finding.nodes.every(path => lock.packages[path]?.dev === true), `${name} must remain development-only`);
  for (const via of finding.via) {
    if (typeof via === 'string') assert(allowed.has(via));
    else assert.equal(via.url, 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm', 'Only the reviewed, unpatched build-tool advisory is deferred');
  }
}
console.log(JSON.stringify({production: 'PASS: zero known advisories', development: 'TRIAGED, NOT FIXED', remaining: all.metadata.vulnerabilities, review: 'docs/DEPENDENCY-SECURITY-2026-10-07.md'}));
