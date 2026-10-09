import { NextRequest } from "next/server";
import { verifyReportCode } from "@/lib/reports/sharing";
import { privateJson, requireOrigin, sharingBody, sharingFailure } from "@/lib/reports/sharingHttp";
import { READER_COOKIE, requireSharingConfig } from "@/lib/reports/sharingPolicy";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const config = requireSharingConfig(); requireOrigin(req, config.origin);
    const { id } = await context.params, body = await sharingBody(req);
    const session = await verifyReportCode(config, id, body.challengeId, body.code);
    const response = privateJson({ path: `/shared/reports/${encodeURIComponent(id)}` });
    response.cookies.set(READER_COOKIE, session.token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", expires: session.expiresAt });
    return response;
  } catch (error) { return sharingFailure(error); }
}
