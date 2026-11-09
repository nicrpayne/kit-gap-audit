import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJsonObject } from "@/lib/http/json";
import { writeErrorResponse } from "@/lib/http/writeErrors";
import { parseBootstrapCreate } from "@/lib/bootstrap/input";
import { BootstrapIdentityConflict, createBootstrap } from "@/lib/bootstrap/identity";

export async function GET() {
  const bootstraps = await prisma.projectBootstrap.findMany({
    where: { status: { not: "archived" } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      canonicalName: true,
      aliases: true,
      status: true,
      updatedAt: true,
      reviewRevision: true,
    },
  });
  return NextResponse.json({ bootstraps });
}

export async function POST(req: NextRequest) {
  try {
    const input = parseBootstrapCreate(await readJsonObject(req));
    const bootstrap = await createBootstrap(input);
    return NextResponse.json({ bootstrap }, { status: 201 });
  } catch (error) {
    // Preserve Add Project's recovery link after a duplicate save or retry.
    if (error instanceof BootstrapIdentityConflict) {
      return NextResponse.json(
        { error: error.message, bootstrapId: error.bootstrapId },
        { status: 409 },
      );
    }
    return writeErrorResponse(error, "Could not create project setup. Please retry.");
  }
}
