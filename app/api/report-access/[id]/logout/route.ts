import { NextRequest } from "next/server";
import { logoutReportReader } from "@/lib/reports/sharing";
import { privateJson, requireOrigin, sharingFailure } from "@/lib/reports/sharingHttp";
import { READER_COOKIE, requireSharingConfig } from "@/lib/reports/sharingPolicy";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const config = requireSharingConfig(); requireOrigin(req, config.origin);
    await logoutReportReader(config, req.cookies.get(READER_COOKIE)?.value);
    const response = privateJson({ signedOut: true });
    response.cookies.set(READER_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
    return response;
  } catch (error) { return sharingFailure(error); }
}
