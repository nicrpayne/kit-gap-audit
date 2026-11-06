import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sessionTokenFor } from "@/lib/auth";
import {
  equalCredential,
  isOperatorToken,
  legacySessionWindowOpen,
  LOGIN_ATTEMPTS,
  LOGIN_WINDOW_MS,
  OPERATOR_SESSION_SECONDS,
  operatorCredentialVersion,
  operatorTokenHash,
} from "./operatorPolicy";

export async function createOperatorSession(password: string, now = new Date()) {
  const token = `op1_${randomBytes(32).toString("hex")}`;
  const expiresAt = new Date(now.getTime() + OPERATOR_SESSION_SECONDS * 1000);
  // Only authentication rows are touched. Expiry has an index, and old
  // sessions are never revived by a successful new login.
  await prisma.$transaction([
    prisma.operatorSession.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.operatorSession.create({
      data: {
        tokenHash: operatorTokenHash(token),
        credentialVersion: operatorCredentialVersion(password),
        createdAt: now,
        expiresAt,
      },
    }),
  ]);
  return { token, expiresAt };
}

/** No positive-auth cache: revocation must apply to the next request. */
export async function authenticateOperatorCookie(
  token: string | undefined,
  password: string,
  now = new Date(),
): Promise<"session" | "legacy" | null> {
  if (isOperatorToken(token)) {
    const session = await prisma.operatorSession.findUnique({
      where: { tokenHash: operatorTokenHash(token) },
    });
    return session &&
      !session.revokedAt &&
      session.expiresAt > now &&
      equalCredential(session.credentialVersion, operatorCredentialVersion(password))
      ? "session"
      : null;
  }
  if (
    token &&
    /^[0-9a-f]{64}$/.test(token) &&
    legacySessionWindowOpen(process.env, now.getTime()) &&
    equalCredential(token, await sessionTokenFor(password))
  )
    return "legacy";
  return null;
}

export async function revokeOperatorSession(token: string | undefined, now = new Date()) {
  if (!isOperatorToken(token)) return;
  await prisma.operatorSession.updateMany({
    where: { tokenHash: operatorTokenHash(token), revokedAt: null },
    data: { revokedAt: now },
  });
}

export async function consumeLoginAttempt(
  now = new Date(),
): Promise<{ allowed: boolean; retryAfter: number }> {
  const reset = new Date(now.getTime() + LOGIN_WINDOW_MS);
  // There is one shared operator account. Use one durable global bucket, not
  // attacker-supplied forwarded IPs or process-local state. The upsert reserves
  // each attempt atomically across concurrent requests and server replicas.
  const rows = await prisma.$queryRaw<{ count: number; resetsAt: Date }[]>`
    INSERT INTO "OperatorLoginRateLimit" ("key", "count", "resetsAt") VALUES ('operator-login', 1, ${reset})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "OperatorLoginRateLimit"."resetsAt" <= ${now} THEN 1
        ELSE LEAST("OperatorLoginRateLimit"."count" + 1, ${LOGIN_ATTEMPTS + 1}) END,
      "resetsAt" = CASE WHEN "OperatorLoginRateLimit"."resetsAt" <= ${now} THEN ${reset}
        ELSE "OperatorLoginRateLimit"."resetsAt" END
    RETURNING "count", "resetsAt"
  `;
  const row = rows[0];
  if (!row) throw new Error("Login attempt reservation failed");
  return {
    allowed: row.count <= LOGIN_ATTEMPTS,
    retryAfter: Math.max(1, Math.ceil((row.resetsAt.getTime() - now.getTime()) / 1000)),
  };
}
