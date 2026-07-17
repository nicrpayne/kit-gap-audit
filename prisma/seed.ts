import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.scope.upsert({
    where: { id: "jsa-seed" },
    update: {},
    create: {
      id: "jsa-seed",
      name: "JSA",
      teamKey: "SOF",
      projectName: "KIT Safety (JSA and iTrack)",
      labelFilter: null,
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
