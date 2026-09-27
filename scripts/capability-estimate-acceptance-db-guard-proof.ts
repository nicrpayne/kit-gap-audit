import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertDisposableDatabaseProofEnvironment } from "./lib/disposable-db-proof-guard";

const optIn = "CAPABILITY_ESTIMATE_DB_PROOF";
const validUrl = "postgresql://signal_t0_local:local-only@127.0.0.1:55440/signal_t0_test_12345?schema=public";
const checkRejected = (env: Readonly<Record<string, string | undefined>>) => assert.throws(
  () => assertDisposableDatabaseProofEnvironment(env, optIn),
  /Refusing to write/,
);

checkRejected({ DATABASE_URL: validUrl });
checkRejected({ [optIn]: "1" });
checkRejected({ [optIn]: "1", DATABASE_URL: "postgresql://signal_t0_local:x@db.example.test:55440/signal_t0_test_12345" });
checkRejected({ [optIn]: "1", DATABASE_URL: "postgresql://postgres:x@127.0.0.1:55440/signal_t0_test_12345" });
checkRejected({ [optIn]: "1", DATABASE_URL: "postgresql://signal_t0_local:x@127.0.0.1:55440/production" });
checkRejected({ [optIn]: "1", DATABASE_URL: "postgresql://signal_t0_local:x@127.0.0.1/signal_t0_test_12345" });
checkRejected({ [optIn]: "1", DATABASE_URL: "https://signal_t0_local:x@127.0.0.1:55440/signal_t0_test_12345" });

const accepted = assertDisposableDatabaseProofEnvironment({ [optIn]: "1", DATABASE_URL: validUrl }, optIn);
assert.equal(accepted.databaseName, "signal_t0_test_12345");
assert.equal(accepted.port, "55440");
assert.equal(assertDisposableDatabaseProofEnvironment({
  [optIn]: "1",
  DATABASE_URL: "postgresql://signal_t0_local:x@localhost:55440/signal_t0_test_9",
}, optIn).url.hostname, "localhost");

const source = readFileSync("scripts/capability-estimate-acceptance-db-proof.ts", "utf8");
const guardIndex = source.indexOf("assertDisposableDatabaseProofEnvironment(process.env");
assert(guardIndex >= 0, "the proof must execute the disposable database guard");
for (const runtimeImport of [
  'await import("../app/api/capabilities/[id]/estimate/route")',
  'await import("../lib/forecast/compute")',
  'await import("../lib/linear")',
  'await import("../lib/prisma")',
  'await import("../lib/scope/knowledgeEstimates")',
  'await import("../lib/scope/reality")',
]) {
  assert(source.indexOf(runtimeImport) > guardIndex, `the guard must execute before ${runtimeImport}`);
}

console.log("PASS capability estimate DB proof guard: explicit opt-in + exact loopback user/database/port contract reject unsafe targets before database imports.");
