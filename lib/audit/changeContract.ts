import { createHash } from "node:crypto";

export const CHANGE_CATEGORIES = [
  "scope", "decision", "dependency", "milestone", "finding",
  "source_health", "capacity", "information",
] as const;

export type AuditChangeCategory = (typeof CHANGE_CATEGORIES)[number];
export type ProjectRelevance =
  | "project_local"
  | "cross_scope_relevant"
  | "neighboring_project_context"
  | "irrelevant_bleed";
export type AuditChangeStatus =
  | "pending"
  | "accepted"
  | "deferred"
  | "rejected"
  | "information_only"
  | "needs_completion";

export interface ChangeEvidence {
  id: string;
  excerpt: string;
  sourceRef?: string | null;
  observedAt?: string | null;
  kind: "evidence" | "intelligence" | "audit" | "operator";
}

export interface ProposedOwnerMutation {
  action: string;
  [key: string]: unknown;
}

export interface AuditChangeDraft {
  key: string;
  scopeId: string;
  auditRunId?: string | null;
  contextSnapshotId?: string | null;
  category: AuditChangeCategory;
  owner: string;
  changeType: string;
  title: string;
  summary: string;
  whyProposed: string;
  currentState: Record<string, unknown>;
  proposedState: ProposedOwnerMutation;
  evidence: ChangeEvidence[];
  currentness: string;
  retrievalBasis: string;
  retrievalConfidence: string;
  forecastEffect?: Record<string, unknown> | null;
  relevanceClass: ProjectRelevance;
  relevanceReason: string;
  sourceKind: "refresh" | "baseline" | "setup";
  recommendedAction: string;
  targetHref?: string | null;
  completionRequirements?: string[];
  initialStatus?: AuditChangeStatus;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function auditChangeFingerprint(input: Pick<AuditChangeDraft, "scopeId" | "key" | "category" | "proposedState">): string {
  const digest = createHash("sha256")
    .update(stable({ v: 1, scopeId: input.scopeId, key: input.key, category: input.category, proposedState: input.proposedState }))
    .digest("hex");
  return `audit-change-v1:${digest}`;
}

export function defaultTargetHref(owner: string, scopeId: string): string {
  const path = owner === "scope" ? "/scope"
    : owner === "decisions" ? "/decisions"
      : owner === "dependencies" ? "/scope"
        : owner === "timeline" ? "/timeline"
          : owner === "capacity" ? "/portfolio"
            : owner === "reports" ? "/reports"
              : owner === "source_configuration" ? "/scope"
              : "/audit";
  return `${path}?project=${encodeURIComponent(scopeId)}`;
}

export function categoryLabel(category: AuditChangeCategory): string {
  return category === "source_health" ? "Source health" : category[0].toUpperCase() + category.slice(1);
}
