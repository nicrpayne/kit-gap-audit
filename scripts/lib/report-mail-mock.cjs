// Loaded explicitly by the isolated HTTP proof, never by the app. Fail closed
// unless an IPC parent and the exact disposable loopback database are present.
const assert = require('node:assert/strict');
const db = new URL(process.env.DATABASE_URL || 'http://invalid');
assert(process.send && process.env.SIGNAL_REPAIR_DB_PROOF === '1' && db.hostname === '127.0.0.1' && db.port === '55434' && db.pathname === '/signal_t0_test_1004');
const original = global.fetch;
global.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url === 'https://api.resend.com/emails') {
    process.send({ type: 'mock-report-mail', body: JSON.parse(String(init.body)), key: new Headers(init.headers).get('Idempotency-Key') });
    return new Response('{"id":"mock-only"}', { status: 200 });
  }
  const host = new URL(url).hostname;
  assert(['localhost', '127.0.0.1'].includes(host), 'HTTP proof must not contact external services');
  return original(input, init);
};
