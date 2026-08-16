import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const KINDS = new Set(["event", "milestone", "kickoff", "delivery", "phase"]);
const STATES = new Set(["occurred", "planned"]);

// EDIT A LANDMARK.
//
// OWNERSHIP, enforced by routing rather than by a warning: this endpoint
// takes a TimelineEvent id. A Report, a Decision or a Linear completion
// has no TimelineEvent row, so there is nothing here to address them with
// — a derived entry simply cannot be edited through Timeline, and the
// inspector sends you to the instrument that owns it instead. That is the
// same rule the projection encodes as `editable: false`, expressed twice
// so neither half can drift.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const existing = await prisma.timelineEvent.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Timeline event not found" }, { status: 404 });

  const { title, date, endDate, temporalState, kind, note } = body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    data.title = title.trim();
  }
  if (date !== undefined) {
    if (typeof date !== "string" || Number.isNaN(new Date(date).getTime())) {
      return NextResponse.json({ error: "A real date is required" }, { status: 400 });
    }
    data.date = new Date(date);
  }
  if (endDate !== undefined) {
    if (endDate === null) data.endDate = null;
    else if (typeof endDate !== "string" || Number.isNaN(new Date(endDate).getTime())) {
      return NextResponse.json({ error: "endDate must be a real date" }, { status: 400 });
    } else data.endDate = new Date(endDate);
  }
  if (temporalState !== undefined) {
    if (typeof temporalState !== "string" || !STATES.has(temporalState)) {
      return NextResponse.json({ error: "temporalState must be 'occurred' or 'planned'" }, { status: 400 });
    }
    data.temporalState = temporalState;
  }
  if (kind !== undefined) {
    if (typeof kind !== "string" || !KINDS.has(kind)) return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
    data.kind = kind;
  }
  if (note !== undefined) data.note = typeof note === "string" && note.trim() ? note.trim() : null;

  const start = (data.date as Date | undefined) ?? existing.date;
  const end = data.endDate === null ? null : ((data.endDate as Date | undefined) ?? existing.endDate);
  if (end && end.getTime() < start.getTime()) {
    return NextResponse.json({ error: "endDate cannot precede date" }, { status: 400 });
  }

  const event = await prisma.timelineEvent.update({ where: { id }, data });
  return NextResponse.json({ event });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await prisma.timelineEvent.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Timeline event not found" }, { status: 404 });
  await prisma.timelineEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
