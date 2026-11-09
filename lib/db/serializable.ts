import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class ConcurrentWriteError extends Error {
  constructor() {
    super("Another save changed this project at the same time. Reload and retry your change.");
  }
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
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034")
        throw error;
      if (attempt === 2) throw new ConcurrentWriteError();
    }
  }
  throw new ConcurrentWriteError();
}
