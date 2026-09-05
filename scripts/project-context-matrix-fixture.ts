import { PrismaClient } from "@prisma/client";

// Disposable-database fixture for the permanent project × instrument proof.
// Refuse to touch any database unless the caller explicitly declares that it
// is the isolated matrix fixture environment.
if (process.env.PROJECT_CONTEXT_MATRIX_FIXTURE !== "1") {
  throw new Error("Refusing to seed: set PROJECT_CONTEXT_MATRIX_FIXTURE=1 for a disposable database.");
}

const prisma = new PrismaClient();

const projects = [
  { id: "matrix-jsa", name: "Matrix JSA", teamKey: "SOF", projectNames: ["KIT Safety (JSA and iTrack)"] },
  { id: "matrix-platform", name: "Matrix Platform", teamKey: "PLAT", projectNames: ["KIT Platform"] },
  { id: "matrix-itrack", name: "Matrix iTrack", teamKey: "TRK", projectNames: ["KIT iTrack"] },
  { id: "matrix-design", name: "Matrix Design", teamKey: "DSN", projectNames: ["KIT Design"] },
] as const;

async function main() {
  for (const [index, project] of projects.entries()) {
    await prisma.scope.upsert({
      where: { id: project.id },
      update: {
        name: project.name,
        teamKey: project.teamKey,
        projectNames: [...project.projectNames],
        labelFilter: null,
        targetDate: new Date(Date.UTC(2026, 10, 1 + index * 7)),
        dependsOnScopeIds: index === 0 ? [] : [projects[index - 1].id],
      },
      create: {
        id: project.id,
        name: project.name,
        teamKey: project.teamKey,
        projectNames: [...project.projectNames],
        labelFilter: null,
        targetDate: new Date(Date.UTC(2026, 10, 1 + index * 7)),
        dependsOnScopeIds: index === 0 ? [] : [projects[index - 1].id],
        createdAt: new Date(Date.UTC(2026, 0, 1 + index)),
      },
    });
  }

  console.log(JSON.stringify({ fixture: "project-context-matrix-v1", projects }, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
