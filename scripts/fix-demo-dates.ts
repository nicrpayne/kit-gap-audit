// DEV ONLY. Puts the Timeline demo's plan objects back where
// scripts/seed-timeline-demo.ts placed them, and clears anything a proof or
// shoot left behind. The proofs restore what they move, but an interrupted
// run cannot, and a fixture that has quietly drifted makes the next
// screenshot lie about the default state.
//
//   npx tsx scripts/fix-demo-dates.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const DAY = 86400000;

/** Offsets in days from now, exactly as seed-timeline-demo.ts sets them. */
const SPANS: Record<string, [number, number]> = {
  "Marketing plan": [8, 26],
  "Field readiness": [19, 40],
  Hardening: [21, 42],
  "Brand refresh": [12, 33],
  "Launch comms": [30, 52],
};
const POINTS: Record<string, number> = {
  "Customer pilot": 26,
  "App Store submission": 44,
  "Design system freeze": -6,
};

async function main() {
  const now = Date.now();
  for (const [title, [a, b]] of Object.entries(SPANS)) {
    const row = await db.timelineEvent.findFirst({ where: { title } });
    if (row) {
      await db.timelineEvent.update({
        where: { id: row.id },
        data: { date: new Date(now + a * DAY), endDate: new Date(now + b * DAY) },
      });
    }
  }
  for (const [title, a] of Object.entries(POINTS)) {
    const row = await db.timelineEvent.findFirst({ where: { title } });
    if (row) {
      await db.timelineEvent.update({
        where: { id: row.id },
        data: { date: new Date(now + a * DAY), endDate: null },
      });
    }
  }
  const stray = await db.timelineEvent.findMany({
    where: { OR: [{ title: { startsWith: "PROOF" } }, { title: { startsWith: "DM " } }, { title: { startsWith: "SHOOT " } }] },
  });
  for (const s of stray) await db.timelineEvent.delete({ where: { id: s.id } });
  console.log(`demo dates restored; removed ${stray.length} stray object(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
