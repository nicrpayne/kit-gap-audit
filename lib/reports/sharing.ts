import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadSavedHandoff } from "./loadSavedHandoff";
import { recipientSnapshot, type RecipientSnapshot } from "./recipientSnapshot";
import { CODE_TTL_MS, SESSION_TTL_MS, SharingError, codeHash, emailAddress, equalSecret, hash, keyedHash, newCode, newSession, recipientList, shareIsActive, type SharingConfig } from "./sharingPolicy";
import { sendReportCode } from "./sharingMail";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const shareInclude = { recipients: { select: { email: true, revokedAt: true } } } as const;
export function shareSummary(row: { id: string; reportId: string; revision: number; expiresAt: Date; revokedAt: Date | null; createdAt: Date; recipients: { email: string; revokedAt: Date | null }[] }) {
  return { id: row.id, reportId: row.reportId, revision: row.revision, expiresAt: row.expiresAt, revokedAt: row.revokedAt, createdAt: row.createdAt,
    recipients: row.recipients.map(r => ({ email: r.email, revokedAt: r.revokedAt })), path: `/shared/reports/${row.id}` };
}
export async function listReportShares(reportId: string) {
  return (await prisma.reportShare.findMany({ where: { reportId }, select: { id: true, reportId: true, revision: true, expiresAt: true, revokedAt: true, createdAt: true, ...shareInclude }, orderBy: { createdAt: "desc" }, take: 100 })).map(shareSummary);
}
export async function createReportShare(reportId: string, input: { emails: unknown; pair: unknown; days: unknown; requestId: unknown }, now = new Date()) {
  const emails = recipientList(input.emails);
  if (typeof input.pair !== "boolean" || ![7, 30, 90].includes(Number(input.days)) || typeof input.days !== "number") throw new SharingError("Choose a report and an access period of 7, 30 or 90 days.");
  if (typeof input.requestId !== "string" || !/^[a-f0-9-]{36}$/.test(input.requestId)) throw new SharingError("A valid request ID is required.");
  const requestId = input.requestId, requestHash = hash(JSON.stringify({ reportId, emails, pair: input.pair, days: input.days }));
  const prior = await prisma.reportShare.findUnique({ where: { requestId }, include: shareInclude });
  if (prior) { if (prior.requestHash !== requestHash) throw new SharingError("This request has already been used for another share.", 409); return shareSummary(prior); }
  const snapshot = recipientSnapshot(await loadSavedHandoff(reportId, input.pair));
  try {
    return shareSummary(await prisma.reportShare.create({ data: { reportId, requestId, requestHash, snapshot: json(snapshot), expiresAt: new Date(now.getTime() + input.days * 86400_000),
      recipients: { create: emails.map(email => ({ email })) }, events: { create: { action: "published", detail: { recipientCount: emails.length, pair: input.pair, days: input.days } } } }, include: shareInclude }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const retry = await prisma.reportShare.findUnique({ where: { requestId }, include: shareInclude });
      if (retry?.requestHash === requestHash) return shareSummary(retry);
      throw new SharingError("This request has already been used for another share.", 409);
    }
    throw error;
  }
}
export async function changeReportShare(reportId: string, shareId: string, input: { revision: unknown; action: unknown; emails?: unknown }, now = new Date()) {
  if (!Number.isSafeInteger(input.revision) || !["recipients", "revoke"].includes(String(input.action))) throw new SharingError("A revision and valid action are required.");
  const emails = input.action === "recipients" ? recipientList(input.emails) : [];
  return prisma.$transaction(async tx => {
    const changed = await tx.reportShare.updateMany({ where: { id: shareId, reportId, revision: input.revision as number, revokedAt: null, expiresAt: { gt: now } },
      data: { revision: { increment: 1 }, ...(input.action === "revoke" ? { revokedAt: now } : {}) } });
    if (changed.count !== 1) throw new SharingError("This share changed, expired or was revoked. Refresh the list.", 409);
    if (input.action === "recipients") {
      await tx.reportShareRecipient.updateMany({ where: { shareId, email: { notIn: emails }, revokedAt: null }, data: { revokedAt: now, generation: { increment: 1 } } });
      for (const email of emails) {
        const existing = await tx.reportShareRecipient.findUnique({ where: { shareId_email: { shareId, email } } });
        if (!existing) await tx.reportShareRecipient.create({ data: { shareId, email } });
        else if (existing.revokedAt) await tx.reportShareRecipient.update({ where: { id: existing.id }, data: { revokedAt: null, generation: { increment: 1 } } });
      }
    }
    await tx.reportShareEvent.create({ data: { shareId, action: String(input.action), detail: { recipientCount: emails.length, priorRevision: input.revision as number } } });
    return shareSummary(await tx.reportShare.findUniqueOrThrow({ where: { id: shareId }, include: shareInclude }));
  });
}

// Atomic across replicas and concurrent requests. Only existing recipient keys
// are created; anonymous traffic must not exhaust a shared login budget.
async function rate(config: SharingConfig, subject: string, limit: number, duration: number, now: Date) {
  const key = keyedHash(config.secret, subject), reset = new Date(now.getTime() + duration);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "ReportShareRateLimit" ("key", "count", "resetsAt") VALUES (${key}, 1, ${reset})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "ReportShareRateLimit"."resetsAt" <= ${now} THEN 1 ELSE "ReportShareRateLimit"."count" + 1 END,
      "resetsAt" = CASE WHEN "ReportShareRateLimit"."resetsAt" <= ${now} THEN ${reset} ELSE "ReportShareRateLimit"."resetsAt" END
    RETURNING "count"`;
  return rows[0].count <= limit;
}
export async function requestReportCode(config: SharingConfig, shareId: string, rawEmail: unknown, now = new Date()) {
  const email = emailAddress(rawEmail), challengeId = randomUUID();
  const none = { challengeId, delivery: null };
  const recipient = await prisma.reportShareRecipient.findUnique({ where: { shareId_email: { shareId, email } }, include: { share: true } });
  if (!recipient || recipient.revokedAt || !shareIsActive(recipient.share, now)) return none;
  if (!(await rate(config, `request:recipient:${recipient.id}`, 3, 15 * 60_000, now))) return none;
  const code = newCode();
  await prisma.reportAccessChallenge.create({ data: { id: challengeId, recipientId: recipient.id, generation: recipient.generation, codeHash: codeHash(config.secret, challengeId, code), expiresAt: new Date(now.getTime() + CODE_TTL_MS) } });
  // Scheduled after the generic HTTP response. The one-time plaintext code
  // exists only in this closure and the mail request, never in persistence.
  return { challengeId, delivery: async (transport: typeof fetch = fetch) => {
    const current = await prisma.reportShareRecipient.findUnique({ where: { id: recipient.id }, include: { share: true } });
    if (!current || current.revokedAt || current.generation !== recipient.generation || !shareIsActive(current.share, new Date())) return;
    try {
      await sendReportCode(config, { challengeId, shareId, email, code }, transport);
      await prisma.reportAccessChallenge.updateMany({ where: { id: challengeId, consumedAt: null }, data: { deliveredAt: new Date() } });
    } catch { /* Fail closed; no code/provider/recipient data in logs. */ }
  } };
}
export async function verifyReportCode(config: SharingConfig, shareId: string, challengeId: unknown, code: unknown, now = new Date()) {
  const denied = () => { throw new SharingError("The code is invalid, expired, or access is no longer available.", 401); };
  if (typeof challengeId !== "string" || challengeId.length > 64 || typeof code !== "string" || !/^\d{8}$/.test(code)) return denied();
  const token = newSession();
  return prisma.$transaction(async tx => {
    // Attempt is committed even on an incorrect code. Never throw inside this
    // transaction for a denied guess or its counter would roll back.
    const attempt = await tx.reportAccessChallenge.updateMany({ where: { id: challengeId, expiresAt: { gt: now }, consumedAt: null, deliveredAt: { not: null }, attempts: { lt: 5 }, recipient: { shareId } }, data: { attempts: { increment: 1 } } });
    if (attempt.count !== 1) return null;
    const challenge = await tx.reportAccessChallenge.findUniqueOrThrow({ where: { id: challengeId }, include: { recipient: { include: { share: true } } } });
    const recipient = challenge.recipient;
    if (recipient.revokedAt || recipient.generation !== challenge.generation || !shareIsActive(recipient.share, now) || !equalSecret(challenge.codeHash, codeHash(config.secret, challengeId, code))) return null;
    const consumed = await tx.reportAccessChallenge.updateMany({ where: { id: challengeId, consumedAt: null }, data: { consumedAt: now } });
    if (consumed.count !== 1) return null;
    const expiresAt = new Date(Math.min(now.getTime() + SESSION_TTL_MS, recipient.share.expiresAt.getTime()));
    await tx.reportReaderSession.create({ data: { tokenHash: keyedHash(config.secret, `session:${token}`), recipientId: recipient.id, generation: recipient.generation, expiresAt } });
    await tx.reportShareEvent.create({ data: { shareId, action: "verified_access", detail: { recipientId: recipient.id } } });
    return { token, expiresAt };
  }).then(result => result ?? denied());
}
export async function readSharedReport(config: SharingConfig, shareId: string, token: string | undefined, now = new Date()) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const session = await prisma.reportReaderSession.findUnique({ where: { tokenHash: keyedHash(config.secret, `session:${token}`) }, include: { recipient: { include: { share: true } } } });
  if (!session || session.expiresAt <= now || session.recipient.shareId !== shareId || session.generation !== session.recipient.generation || session.recipient.revokedAt || !shareIsActive(session.recipient.share, now)) return null;
  return { snapshot: session.recipient.share.snapshot as unknown as RecipientSnapshot, expiresAt: session.recipient.share.expiresAt.toISOString() };
}
export async function logoutReportReader(config: SharingConfig, token: string | undefined) {
  if (token) await prisma.reportReaderSession.deleteMany({ where: { tokenHash: keyedHash(config.secret, `session:${token}`) } });
}
