import { Prisma } from "@prisma/client";
import { ConcurrentWriteError } from "@/lib/db/serializable";
import { RequestValidationError, validationResponse } from "./json";

/** Only deliberate domain messages cross the API boundary; database details stay server-side. */
export function writeErrorResponse(error: unknown, message: string): Response {
  if (error instanceof RequestValidationError) return validationResponse(error);
  if (error instanceof ConcurrentWriteError)
    return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return Response.json(
      { error: "That record no longer exists. Reload before retrying." },
      { status: 404 },
    );
  }
  console.error(message, error);
  return Response.json({ error: message }, { status: 500 });
}
