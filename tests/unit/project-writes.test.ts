import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ConcurrentWriteError, serializableWrite } from "../../lib/db/serializable";
import { writeErrorResponse } from "../../lib/http/writeErrors";
import { RequestValidationError } from "../../lib/http/json";

const databaseError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("private connection/query details", {
    code,
    clientVersion: Prisma.prismaVersion.client,
  });

test("Serializable writes retry only serialization failures, and only three times", async () => {
  const original = prisma.$transaction;
  let attempts = 0;
  try {
    prisma.$transaction = (async (
      work: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options: { isolationLevel: string },
    ) => {
      assert.equal(options.isolationLevel, "Serializable");
      attempts++;
      if (attempts < 3) throw databaseError("P2034");
      // No DB calls in this unit; the callback only returns a marker.
      return work({} as Prisma.TransactionClient);
    }) as typeof prisma.$transaction;
    assert.equal(await serializableWrite(async () => "committed"), "committed");
    assert.equal(attempts, 3);
    attempts = 0;
    prisma.$transaction = (async () => {
      attempts++;
      throw databaseError("P2034");
    }) as typeof prisma.$transaction;
    await assert.rejects(
      serializableWrite(async () => "never"),
      ConcurrentWriteError,
    );
    assert.equal(attempts, 3);
    attempts = 0;
    prisma.$transaction = (async () => {
      attempts++;
      throw databaseError("P2028");
    }) as typeof prisma.$transaction;
    await assert.rejects(
      serializableWrite(async () => "never"),
      { code: "P2028" },
    );
    assert.equal(attempts, 1, "Timeouts and unknown outcomes must not be blindly retried");
    for (const sqlState of ["40001", "40P01", "08006"]) {
      attempts = 0;
      prisma.$transaction = (async () => {
        attempts++;
        throw new Prisma.PrismaClientKnownRequestError("raw query error", {
          code: "P2010",
          clientVersion: Prisma.prismaVersion.client,
          meta: { code: sqlState },
        });
      }) as typeof prisma.$transaction;
      await assert.rejects(
        serializableWrite(async () => "never"),
        sqlState === "08006" ? { code: "P2010" } : ConcurrentWriteError,
      );
      assert.equal(attempts, sqlState === "08006" ? 1 : 3);
    }
  } finally {
    prisma.$transaction = original;
  }
});

test("Project API errors expose deliberate recovery messages, not raw database details", async () => {
  const log = mock.method(console, "error", () => undefined);
  try {
    for (const [error, status] of [
      [new RequestValidationError("Choose a distinct name.", 409), 409],
      [new ConcurrentWriteError(), 409],
      [databaseError("P2025"), 404],
      [databaseError("P2028"), 500],
      [new Error("private secret"), 500],
    ] as const) {
      const response = writeErrorResponse(error, "Could not save. Reload before retrying.");
      assert.equal(response.status, status);
      const text = await response.text();
      assert(!/private|connection|query/.test(text));
    }
    assert.equal(log.mock.calls.length, 2, "Unexpected faults remain observable server-side");
  } finally {
    log.mock.restore();
  }
});
