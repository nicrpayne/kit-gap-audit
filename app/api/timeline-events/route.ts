import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const KINDS = new Set(["event", "milestone", "kickoff", "delivery", "phase"]);
const STATES = new Set(["occurred", "planned"]);

// CREATE A LANDMARK.
//
// The one thing Timeline owns. Deliberately small: a project, a title, a
// date and whether it HAPPENED or is INTENDED. No owner, no status
// workflow, no percent complete, no subtasks — a timeline of landmarks is
// not a task tracker, and every field added here is a step toward becoming
// one.
//
// temporalState is REQUIRED and stored. The server will not infer it from
// the date, now or ever: a planned milestone whose date has passed is
// overdue, and that is information the product exists to show.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { scopeId, title, date, endDate, temporalState, kind, note } = body as Record<string, unknown>;

  if (typeof scopeId !== "string" || !scopeId) return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  if (typeof title !== "string" || !title.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (typeof date !== "string" || Number.isNaN(new Date(date).getTime())) {
    return NextResponse.json({ error: "A real date is required" }, { status: 400 });
  }
  if (typeof temporalState !== "string" || !STATES.has(temporalState)) {
    return NextResponse.json({ error: "temporalState must be 'occurred' or 'planned'" }, { status: 400 });
  }
  const landmarkKind = typeof kind === "string" && KINDS.has(kind) ? kind : "event";
  if (endDate !== undefined && endDate !== null) {
    if (typeof endDate !== "string" || Number.isNaN(new Date(endDate).getTime())) {
      return NextResponse.json({ error: "endDate must be a real date" }, { status: 400 });
    }
    if (new Date(endDate).getTime() < new Date(date).getTime()) {
      return NextResponse.json({ error: "endDate cannot precede date" }, { status: 400 });
    }
  }

  const scope = await prisma.scope.findUnique({ where: { id: scopeId }, select: { id: true } });
  if (!scope) return NextResponse.json({ error: "Scope not found" }, { status: 404 });

  const event = await prisma.timelineEvent.create({
    data: {
      scopeId,
      title: title.trim(),
      date: new Date(date),
      endDate: typeof endDate === "string" ? new Date(endDate) : null,
      temporalState,
      kind: landmarkKind,
      note: typeof note === "string" && note.trim() ? note.trim() : null,
      source: "manual",
      sourceLabel: "Added by hand",
    },
  });

  return NextResponse.json({ event }, { status: 201 });
}
