import type { Prisma } from "@prisma/client";

/** Scenario rows are immutable hypothetical artifacts, not canonical forecast
 * memory. Every operational trend/history reader uses this filter; the
 * Reports archive intentionally does not, because it must display both halves
 * of an explicit comparison. Null retains reports created before mode existed. */
export const CANONICAL_REPORT_MODE_WHERE = {
  OR: [{ mode: "reality" }, { mode: null }],
} satisfies Prisma.ReportWhereInput;

export const CANONICAL_REPORT_ORDER_DESC = [
  { generatedAt: "desc" },
  { id: "desc" },
] satisfies Prisma.ReportOrderByWithRelationInput[];

export const CANONICAL_REPORT_ORDER_ASC = [
  { generatedAt: "asc" },
  { id: "asc" },
] satisfies Prisma.ReportOrderByWithRelationInput[];
