import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Single-row settings, created on first read with contextSwitchCostPct
// defaulting to 0 (no penalty) -- there's nothing to seed at migration
// time since 0 is already the schema default.
async function getOrCreateSettings() {
  return prisma.portfolioSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function GET() {
  const settings = await getOrCreateSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  let body: { contextSwitchCostPct?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    body.contextSwitchCostPct !== undefined &&
    (typeof body.contextSwitchCostPct !== "number" ||
      body.contextSwitchCostPct < 0 ||
      body.contextSwitchCostPct > 100)
  ) {
    return NextResponse.json({ error: "contextSwitchCostPct must be a number between 0 and 100" }, { status: 400 });
  }

  await getOrCreateSettings();
  const settings = await prisma.portfolioSettings.update({
    where: { id: "singleton" },
    data: {
      ...(body.contextSwitchCostPct !== undefined ? { contextSwitchCostPct: body.contextSwitchCostPct } : {}),
    },
  });

  return NextResponse.json({ settings });
}
