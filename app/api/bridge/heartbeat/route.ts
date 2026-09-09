import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeCompanionId } from "@/lib/bootstrap/jobs";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 4_096) return NextResponse.json({ error: "Heartbeat body too large" }, { status: 413 });
  const body = (() => { try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; } })();
  const id = safeCompanionId(body?.companionId);
  const version = typeof body?.version === "string" ? body.version.slice(0, 40) : "unknown";
  const label = typeof body?.label === "string" ? body.label.slice(0, 120) : "Local knowledge companion";
  const state = typeof body?.state === "string" && ["online", "scanning", "paused", "degraded"].includes(body.state) ? body.state : "online";
  const knowledge = body?.knowledge && typeof body.knowledge === "object" && !Array.isArray(body.knowledge)
    ? body.knowledge as Record<string, unknown>
    : null;
  const knowledgeState = knowledge && typeof knowledge.state === "string" && ["current", "ingesting", "running", "degraded"].includes(knowledge.state)
    ? {
        state: knowledge.state,
        ...(typeof knowledge.watermark === "string" && !Number.isNaN(Date.parse(knowledge.watermark)) ? { watermark: new Date(knowledge.watermark).toISOString() } : {}),
        ...(typeof knowledge.detail === "string" ? { detail: knowledge.detail.slice(0, 500) } : {}),
      }
    : null;
  if (!id) return NextResponse.json({ error: "Invalid companionId" }, { status: 400 });
  const now = new Date();
  const companion = await prisma.bootstrapCompanion.upsert({
    where: { id },
    create: {
      id, version, label, state, lastSeenAt: now,
      capabilities: { packageVersions: ["1.1"], transport: "poll-v1", knowledgeWatermark: "optional-v1" } as Prisma.InputJsonValue,
      ...(knowledgeState ? { knowledgeState: knowledgeState as Prisma.InputJsonValue, lastKnowledgeAt: now } : {}),
    },
    update: {
      version, label, state, lastSeenAt: now,
      ...(knowledgeState ? { knowledgeState: knowledgeState as Prisma.InputJsonValue, lastKnowledgeAt: now } : {}),
    },
  });
  return NextResponse.json({ ok: true, serverTime: now.toISOString(), companion: { id: companion.id, state: companion.state } });
}
