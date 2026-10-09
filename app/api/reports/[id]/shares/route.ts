import { NextRequest } from "next/server";
import { changeReportShare, createReportShare, listReportShares } from "@/lib/reports/sharing";
import { privateJson, requireReportOwner, sharingBody, sharingFailure } from "@/lib/reports/sharingHttp";
import { requireSharingConfig, sharingSetup, SharingError } from "@/lib/reports/sharingPolicy";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, context: Context) {
  try { await requireReportOwner(req); const { id } = await context.params; const setup = sharingSetup();
    return privateJson({ ready: Boolean(setup.config), missing: setup.missing, shares: await listReportShares(id) });
  } catch (error) { return sharingFailure(error); }
}
export async function POST(req: NextRequest, context: Context) {
  try {
    await requireReportOwner(req, true); requireSharingConfig();
    const { id } = await context.params, body = await sharingBody(req);
    if (body.reviewedPrivateContent !== true) throw new SharingError("Review the private report content before sharing it.");
    return privateJson({ share: await createReportShare(id, { emails: body.emails, pair: body.pair, days: body.days, requestId: body.requestId }) }, 201);
  } catch (error) { return sharingFailure(error); }
}
export async function PATCH(req: NextRequest, context: Context) {
  try {
    await requireReportOwner(req, true);
    const { id } = await context.params, body = await sharingBody(req);
    if (typeof body.shareId !== "string" || body.shareId.length > 64) throw new SharingError("Choose a share.");
    // Revocation remains available even if the email service loses config.
    return privateJson({ share: await changeReportShare(id, body.shareId, { revision: body.revision, action: body.action, emails: body.emails }) });
  } catch (error) { return sharingFailure(error); }
}
