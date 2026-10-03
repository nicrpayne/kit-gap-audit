import { prisma } from "@/lib/prisma";
import { savedReportHandoff } from "./savedHandoff";

export async function loadSavedHandoff(reportId: string, pair: boolean) {
  const selected = await prisma.report.findUnique({ where: { id: reportId }, select: { scopeId: true } });
  if (!selected) throw new Error("Saved report not found.");
  const rows = await prisma.report.findMany({
    where: pair ? { scopeId: selected.scopeId } : { id: reportId },
    select: { id: true, mode: true, briefSnapshot: true, briefRecipe: true },
  });
  return savedReportHandoff(rows, reportId, pair);
}
