import { RequestValidationError, requiredString } from "@/lib/http/json";

export interface PersonInput {
  name?: string;
  fte?: number;
  externalCommitmentFte?: number;
  active?: boolean;
}

/** Validate before database access. Omitted PATCH fields retain their saved values. */
export function parsePersonInput(body: Record<string, unknown>): PersonInput {
  const input: PersonInput = {};
  if (body.name !== undefined) input.name = requiredString(body.name, "name");
  if (body.fte !== undefined) {
    if (
      typeof body.fte !== "number" ||
      !Number.isFinite(body.fte) ||
      body.fte <= 0 ||
      body.fte > 1
    ) {
      throw new RequestValidationError("fte must be a number between 0 (exclusive) and 1");
    }
    input.fte = body.fte;
  }
  if (body.externalCommitmentFte !== undefined) {
    if (
      typeof body.externalCommitmentFte !== "number" ||
      !Number.isFinite(body.externalCommitmentFte) ||
      body.externalCommitmentFte < 0 ||
      body.externalCommitmentFte > 1
    ) {
      throw new RequestValidationError("externalCommitmentFte must be between 0 and 1");
    }
    input.externalCommitmentFte = body.externalCommitmentFte;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean")
      throw new RequestValidationError("active must be a boolean");
    input.active = body.active;
  }
  return input;
}

export function validateExternalCommitment(fte: number, external: number): void {
  if (!Number.isFinite(fte) || !Number.isFinite(external) || external < 0 || external > fte) {
    throw new RequestValidationError(
      "externalCommitmentFte must be between 0 and the person's available FTE",
    );
  }
}
