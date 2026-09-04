// THE ONLY PATH THAT WRITES TO LINEAR, AND IT NOW REFUSES TO DO SO BY
// ACCIDENT.
//
// This route used to create a real issue in a real external workspace on a
// bare POST with no body — one click of "Draft ticket", one issue filed,
// nothing shown to the person first and nothing to undo it with. The bulk
// button fanned that out across every selected finding at once.
//
// The write now requires an explicit `{ confirm: true }`. That ordering
// matters more than it looks: an un-confirmed POST does not merely fail, it
// returns the PREVIEW, so the old call shape is not just refused but
// redirected into the safe flow. Any caller written against the previous
// contract — including one we have forgotten about — now gets a payload to
// show a human instead of creating an issue. It fails safe rather than
// failing closed.
//
// The payload itself is composed in lib/findings/ticketPayload.ts, shared
// with the preview route, so what a person approves and what is sent cannot
// drift apart.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLinearIssue, invalidateIssueCache } from "@/lib/linear";
import { composeTicketPayload } from "@/lib/findings/ticketPayload";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const result = await composeTicketPayload(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const payload = result.payload;

  // A body is optional on the wire, so parse defensively: a POST with no
  // body at all is precisely the legacy call shape, and it must land in the
  // refusal branch rather than throwing.
  let body: { confirm?: unknown } = {};
  try {
    body = (await req.json()) as { confirm?: unknown };
  } catch {
    /* no body — treated as unconfirmed */
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      {
        error:
          "Creating a Linear issue requires explicit confirmation. Review the preview and send { confirm: true } to file it.",
        preview: payload,
        created: false,
      },
      { status: 400 }
    );
  }

  try {
    const issue = await createLinearIssue({
      title: payload.title,
      description: payload.description,
      teamKey: payload.teamKey,
    });
    invalidateIssueCache();

    const updated = await prisma.finding.update({
      where: { id },
      data: { status: "ticketed", linearIssueId: issue.identifier },
    });

    return NextResponse.json({ finding: updated, linearIssue: issue, created: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't create Linear issue: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }
}
