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
  if (!id) return NextResponse.json({ error: "Invalid companionId" }, { status: 400 });
  const now = new Date();
  const companion = await prisma.bootstrapCompanion.upsert({
    where: { id },
    create: { id, version, label, state, lastSeenAt: now, capabilities: { packageVersions: ["1.1"], transport: "poll-v1" } as Prisma.InputJsonValue },
    update: { version, label, state, lastSeenAt: now },
  });
  return NextResponse.json({ ok: true, serverTime: now.toISOString(), companion: { id: companion.id, state: companion.state } });
}
