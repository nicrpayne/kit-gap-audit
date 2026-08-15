import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

// THE IMPORT DOOR — paste, or a spreadsheet already flattened to text.
//
// One rule governs both modes: an import can never create a gate. Text
// that says "this is blocking everything" is a sentence, not a proven
// serial dependency, and the only way to reach the forecast is still
// /api/decisions/[id]/gate.
//
// Two modes, because the two inputs are genuinely different:
//
//   candidates (default) — machine-parsed, uncertain. Nothing becomes
//     Reality; rows land in the tray for review, exactly like a Hermes
//     derived claim.
//   decisions — an explicit confirmation that these rows ARE decisions.
//     They become OPEN Decisions, still ungated.
//
// .xlsx arrives here already flattened by /api/parse-spreadsheet, which
// emits the pipe-delimited rows this parser reads. No mapping wizard.

const MAX_ROWS = 200;
const HEADERISH = /^(decision|title|question|choice|topic|item)$/i;

// Splits a pasted block into { title, context } rows. Handles plain lines,
// the pipe rows /api/parse-spreadsheet emits, CSV and TSV — the first cell
// is the question, anything after it is context.
function parseRows(text: string): { title: string; context: string | null; raw: string }[] {
  const rows: { title: string; context: string | null; raw: string }[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const cells = line
      .split(/\s*\|\s*|\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
      .map((c) => c.trim().replace(/^"|"$/g, ""))
      .filter((c) => c.length > 0);
    if (cells.length === 0) continue;
    // A header row names its columns rather than asking a question.
    if (rows.length === 0 && HEADERISH.test(cells[0])) continue;
    const title = cells[0];
    if (title.length < 3) continue;
    rows.push({ title, context: cells.slice(1).join(" · ") || null, raw: line });
    if (rows.length >= MAX_ROWS) break;
  }
  return rows;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function POST(req: NextRequest) {
  let body: { scopeId?: string; text?: string; mode?: string; sourceLabel?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.scopeId) return NextResponse.json({ error: "A decision belongs to a project." }, { status: 400 });
  const scope = await prisma.scope.findUnique({ where: { id: body.scopeId }, select: { id: true } });
  if (!scope) return NextResponse.json({ error: "Unknown project" }, { status: 400 });

  const mode = body.mode === "decisions" ? "decisions" : "candidates";
  const sourceLabel = body.sourceLabel?.trim() || "Pasted text";
  const rows = parseRows(body.text ?? "");
  if (rows.length === 0) {
    return NextResponse.json({ error: "Nothing in that text looked like a decision." }, { status: 400 });
  }

  if (mode === "candidates") {
    let imported = 0;
    let alreadyKnown = 0;
    for (const row of rows) {
      // Stable per project + question, so re-pasting the same notes does
      // not refill the tray — and a dismissal is remembered.
      const claimKey = `paste:${createHash("sha256").update(`${body.scopeId}:${normalize(row.title)}`).digest("hex").slice(0, 16)}`;
      const existing = await prisma.decisionCandidate.findUnique({ where: { claimKey } });
      if (existing) {
        alreadyKnown++;
        continue;
      }
      await prisma.decisionCandidate.create({
        data: {
          claimKey,
          scopeId: body.scopeId,
          title: row.title,
          question: row.context,
          sourceLabel,
          excerpts: [row.raw],
          status: "pending",
        },
      });
      imported++;
    }
    return NextResponse.json({ mode, rows: rows.length, imported, alreadyKnown, decisionsCreated: 0, gatesCreated: 0 });
  }

  // ── EXPLICIT CONFIRMATION: these rows really are decisions ────────────
  const siblings = await prisma.decision.findMany({
    where: { scopeId: body.scopeId, status: { in: ["open", "decided"] } },
    select: { id: true, title: true, status: true },
  });
  const byNormalized = new Map(siblings.map((d) => [normalize(d.title), d]));

  const created: { id: string; title: string }[] = [];
  const possibleDuplicates: { title: string; existing: { id: string; title: string; status: string } }[] = [];
  for (const row of rows) {
    const dupe = byNormalized.get(normalize(row.title));
    if (dupe) {
      // Surfaced, never silently merged or silently duplicated — §32's
      // choice belongs to the human, so the row is reported and skipped.
      possibleDuplicates.push({ title: row.title, existing: dupe });
      continue;
    }
    const decision = await prisma.decision.create({
      data: { scopeId: body.scopeId, title: row.title, rationale: row.context, status: "open" },
    });
    await prisma.decisionEvidence.create({
      data: { decisionId: decision.id, kind: "manual", excerpt: row.raw, sourceLabel },
    });
    byNormalized.set(normalize(row.title), { id: decision.id, title: decision.title, status: "open" });
    created.push({ id: decision.id, title: decision.title });
  }

  return NextResponse.json({
    mode,
    rows: rows.length,
    decisionsCreated: created.length,
    created,
    possibleDuplicates,
    // Stated because it is the property that matters: an import is inert
    // with respect to delivery.
    gatesCreated: 0,
  });
}
