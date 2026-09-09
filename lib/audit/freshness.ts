export type KnowledgeFreshnessCode =
  | "current"
  | "new_available"
  | "ingesting"
  | "refreshing"
  | "offline"
  | "unavailable";

export interface FreshnessInput {
  activationAvailable: boolean;
  companionOnline: boolean;
  ingestionState?: string | null;
  jobRunning: boolean;
  packageAheadOfSnapshot: boolean;
  watermarkAheadOfPackage: boolean;
}

export interface FreshnessDecision {
  code: KnowledgeFreshnessCode;
  label: string;
  detail: string;
  canRefresh: boolean;
}

export function deriveKnowledgeFreshness(input: FreshnessInput): FreshnessDecision {
  if (!input.activationAvailable) return { code: "unavailable", label: "Knowledge refresh unavailable", detail: "This project has no activation/companion identity.", canRefresh: false };
  if (!input.companionOnline) return { code: "offline", label: "Knowledge companion offline", detail: "Refresh is unavailable until the local companion checks in.", canRefresh: false };
  if (input.ingestionState === "running" || input.ingestionState === "ingesting") return { code: "ingesting", label: "Hermes ingestion in progress · waiting", detail: "Signal will not request a package from a split-brain partial state.", canRefresh: false };
  if (input.jobRunning) return { code: "refreshing", label: "Refreshing Audit…", detail: "The companion is compiling the latest completed project knowledge.", canRefresh: false };
  if (input.packageAheadOfSnapshot || input.watermarkAheadOfPackage) return { code: "new_available", label: "New intelligence available · Refresh", detail: input.packageAheadOfSnapshot ? "A completed package is newer than the last frozen ContextSnapshot." : "The companion reports a newer completed Hermes knowledge watermark.", canRefresh: true };
  return { code: "current", label: "Knowledge · Current", detail: "The latest completed package and ContextSnapshot agree.", canRefresh: false };
}
