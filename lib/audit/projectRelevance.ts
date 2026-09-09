import type { BootstrapProposal } from "@/lib/bootstrap/contracts";
import type { ProjectRelevance } from "./changeContract";

export interface ProjectIdentityForRelevance {
  id: string;
  name: string;
  aliases: string[];
}

export interface RelevanceResult {
  classification: ProjectRelevance;
  reason: string;
}

function normalized(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mentions(text: string, identity: ProjectIdentityForRelevance): boolean {
  return [identity.name, ...identity.aliases]
    .map(normalized)
    .filter((name) => name.length >= 3)
    .some((name) => ` ${text} `.includes(` ${name} `));
}

function isCausal(proposal: Pick<BootstrapProposal, "kind" | "payload" | "statement" | "title">): boolean {
  if (proposal.kind !== "dependency") return false;
  const text = normalized(`${proposal.title} ${proposal.statement} ${JSON.stringify(proposal.payload)}`);
  return /\b(depends|dependency|prerequisite|blocked by|requires|upstream|downstream)\b/.test(text);
}

// Relevance is a retrieval classification, not a truth score. A neighboring
// project can remain visible as context without being allowed to masquerade as
// this project's delivery delta.
export function classifyProjectRelevance(
  proposal: Pick<BootstrapProposal, "kind" | "payload" | "statement" | "title">,
  project: ProjectIdentityForRelevance,
  identities: ProjectIdentityForRelevance[],
): RelevanceResult {
  const text = normalized(`${proposal.title} ${proposal.statement} ${JSON.stringify(proposal.payload)}`);
  const own = mentions(text, project);
  const others = identities.filter((item) => item.id !== project.id && mentions(text, item));
  if (own && others.length === 0) {
    return { classification: "project_local", reason: `The proposal explicitly names ${project.name} and no neighboring project.` };
  }
  if (own && others.length > 0 && isCausal(proposal)) {
    return { classification: "cross_scope_relevant", reason: `A causal relationship connects ${project.name} with ${others.map((item) => item.name).join(", ")}.` };
  }
  if (own && others.length > 0) {
    return { classification: "neighboring_project_context", reason: `The evidence mentions ${project.name} and neighboring ${others.map((item) => item.name).join(", ")}, without a causal delivery relationship.` };
  }
  if (!own && others.length > 0 && isCausal(proposal)) {
    const platform = others.find((item) => normalized(item.name).includes("platform"));
    if (platform) {
      return { classification: "cross_scope_relevant", reason: `${platform.name} is named in a causal dependency proposal for the selected project.` };
    }
  }
  if (!own && others.length > 0) {
    const named = others.map((item) => item.name).join(", ");
    return project.name.toLowerCase().includes("itrack") && others.some((item) => item.name.toLowerCase().includes("jsa"))
      ? { classification: "irrelevant_bleed", reason: `JSA-only material was retrieved into the iTrack package without an iTrack or causal link.` }
      : { classification: "neighboring_project_context", reason: `The proposal is about neighboring ${named}, not accepted ${project.name} Reality.` };
  }
  return { classification: "project_local", reason: `The scoped compiler returned no conflicting project identity.` };
}
