import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class ConcurrentWriteError extends Error {
  constructor() {
    super("Another save changed this project at the same time. Reload and retry your change.");
  }
}

function transactionWasAborted(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  // Prisma preserves PostgreSQL SQLSTATE on raw row-lock queries instead of
  // translating it to P2034. Both states guarantee the transaction aborted;
  // timeouts, disconnects and other uncertain outcomes must never be retried.
  return error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code));
}

/** Retry the entire read/check/write unit, never just its last write. */
export async function serializableWrite<T>(
  write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(write, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!transactionWasAborted(error)) throw error;
      if (attempt === 2) throw new ConcurrentWriteError();
    }
  }
  throw new ConcurrentWriteError();
}
