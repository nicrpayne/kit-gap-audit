import { LinearClient, LinearDocument, type LinearRawResponse } from "@linear/sdk";

const KIT_FOUND_LABEL = "kit-found";

let cachedClient: LinearClient | null = null;

function getClient(): LinearClient {
  if (!cachedClient) {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) throw new Error("LINEAR_API_KEY is not set");
    cachedClient = new LinearClient({ apiKey });
  }
  return cachedClient;
}

export interface ScopeFilter {
  teamKey: string;
  projectNames?: string[];
  labelFilter?: string | null;
  executionState?: string;
}

export interface LinearIssueSummary {
  identifier: string;
  url?: string | null;
  title: string;
  description: string | null;
  state: string;
  // Workflow state type: triage | backlog | unstarted | started | completed
  // | canceled. Distinct from `state` (the display name, e.g. "In Review")
  // -- needed to tell "done" from "remaining" work for the Forecast engine.
  stateType: string;
  estimate: number | null;
  assignee: string | null;
  labels: string[];
  // Null unless the issue is in a "completed" state. Powers "what shipped
  // since the last report" without a second fetch.
  completedAt: string | null;
  /** Linear's canonical content-update timestamp. Optional so historical
      fixtures remain valid; live reads always request it. */
  updatedAt?: string | null;
  // THE FEATURE LAYER. Linear has no first-class "Feature" entity -- what it
  // has is issue nesting (parent/children) and Projects. After the Epic ->
  // Feature -> Issue -> Sub-issue reorganisation, a FEATURE is the ancestor
  // issue an implementation issue hangs from, and the EPIC is the Project
  // those features live in.
  //
  // Both are read here rather than inferred from titles or labels, because a
  // product capability is exactly the kind of thing this app must not guess
  // at. An issue with no parent has no feature -- that is a real coverage
  // gap, and Scope shows it as one instead of inventing a bucket.
  //
  // `parent` is the DIRECT parent only. A sub-issue's parent is an issue, not
  // a feature; lib/scope/features.ts walks the chain to find the top of it.
  parentIdentifier: string | null;
  parentTitle: string | null;
  // The Linear Project this issue belongs to -- the Epic in the new
  // structure. Null for issues filed outside any project.
  projectName: string | null;
}

// One GraphQL query per 100 issues with state/assignee/labels inlined.
// The SDK's issue.state / issue.assignee / issue.labels() are each a lazy
// follow-up request -- the first version of this function used them and
// cost ~3 requests *per issue* (~770 calls for a 255-issue scope), which
// blew Linear's 2500/hour rate limit within a few page loads.
const SCOPED_ISSUES_QUERY = `
  query ScopedIssues($filter: IssueFilter, $after: String) {
    issues(filter: $filter, first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        identifier
        url
        title
        description
        estimate
        completedAt
        updatedAt
        state { name type }
        assignee { name }
        labels { nodes { name } }
        parent { identifier title }
        project { name }
      }
    }
  }
`;

interface ScopedIssuesQueryData {
  issues: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      identifier: string;
      url: string;
      title: string;
      description: string | null;
      estimate: number | null;
      completedAt: string | null;
      updatedAt: string;
      state: { name: string; type: string } | null;
      assignee: { name: string } | null;
      labels: { nodes: { name: string }[] };
      parent: { identifier: string; title: string } | null;
      project: { name: string } | null;
    }[];
  };
}

// Refreshing the Forecast page shouldn't cost a fresh Linear read every
// time -- issues don't change minute to minute. Small in-process TTL cache;
// fine on Railway where next start is one long-lived process.
const ISSUE_CACHE_TTL_MS = 2 * 60 * 1000;
const issueCache = new Map<string, { at: number; issues: LinearIssueSummary[] }>();

/** A governed Linear write changes the canonical work set immediately.
 * Drop every filtered view so the next Forecast/Scope read cannot retain a
 * pre-write list and temporarily lose the newly represented Finding. */
export function invalidateIssueCache(): void {
  issueCache.clear();
}

// All non-canceled issues matching a Scope: team key, optionally narrowed by
// one or more Linear project names (union -- e.g. a product Scope pulling
// its own project plus shared Platform work) and/or a label. Scopes are
// data (see Scope model), not env vars, so a new module (Precon, Design,
// ...) is a new row, not a redeploy.
export async function getScopedIssues(scope: ScopeFilter): Promise<LinearIssueSummary[]> {
  // An activated project is valid before an execution system is configured.
  // Returning the empty structural read here keeps Audit/Scope navigable;
  // Forecast itself checks executionState and refuses to manufacture a date.
  if (scope.executionState && scope.executionState !== "configured") return [];
  // Offline/design mode: opt-in only, never set in a real deployment. Lets
  // the whole app (especially /portfolio's live simulation) run without a
  // Linear key or network. See lib/dev/fixtures.ts.
  if (process.env.KIT_DEV_FIXTURES === "1") {
    const { devFixtureIssues } = await import("@/lib/dev/fixtures");
    return devFixtureIssues(scope);
  }

  const projectNames = scope.projectNames ?? [];
  const cacheKey = `${scope.teamKey}::${[...projectNames].sort().join(",")}::${scope.labelFilter ?? ""}`;
  const cached = issueCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ISSUE_CACHE_TTL_MS) {
    return cached.issues;
  }

  const client = getClient();

  const filter: LinearDocument.IssueFilter = {
    team: { key: { eq: scope.teamKey } },
    state: { type: { nin: ["canceled"] } },
  };
  if (projectNames.length > 0) {
    filter.project = { name: { in: projectNames } };
  }
  if (scope.labelFilter) {
    filter.labels = { some: { name: { eq: scope.labelFilter } } };
  }

  const issues: LinearIssueSummary[] = [];
  let after: string | null = null;

  while (true) {
    const response: LinearRawResponse<ScopedIssuesQueryData> = await client.client.rawRequest<
      ScopedIssuesQueryData,
      Record<string, unknown>
    >(SCOPED_ISSUES_QUERY, { filter, after });
    const page = response.data?.issues;
    if (!page) throw new Error("Linear returned no issue data");

    for (const node of page.nodes) {
      issues.push({
        identifier: node.identifier,
        url: node.url ?? null,
        title: node.title,
        description: node.description ? node.description.slice(0, 500) : null,
        state: node.state?.name ?? "Unknown",
        stateType: node.state?.type ?? "unstarted",
        estimate: node.estimate ?? null,
        assignee: node.assignee?.name ?? null,
        labels: node.labels.nodes.map((l) => l.name),
        completedAt: node.completedAt ?? null,
        updatedAt: node.updatedAt ?? null,
        parentIdentifier: node.parent?.identifier ?? null,
        parentTitle: node.parent?.title ?? null,
        projectName: node.project?.name ?? null,
      });
    }

    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }

  issueCache.set(cacheKey, { at: Date.now(), issues });
  return issues;
}

export interface LinearTeamSummary {
  key: string;
  name: string;
}

export interface LinearProjectSummary {
  id: string;
  name: string;
}

export interface ValidatedLinearBoundary {
  teamKey: string;
  projectNames: [string];
  projectId: string;
  detail: string;
}

export class LinearBoundaryValidationError extends Error {
  readonly status = 409;
}

export function resolveLinearBoundary(
  teamKeyInput: string | undefined,
  projectNamesInput: string[] | undefined,
  projects: LinearProjectSummary[]
): ValidatedLinearBoundary {
  const teamKey = teamKeyInput?.trim() ?? "";
  const projectNames = [...new Set((projectNamesInput ?? []).map((name) => name.trim()).filter(Boolean))];
  if (!teamKey) throw new LinearBoundaryValidationError("Choose a Linear team before saving execution setup.");
  if (projectNames.length !== 1) {
    throw new LinearBoundaryValidationError(projectNames.length === 0
      ? "Choose one active Linear project. Signal will not silently expand an empty boundary to the whole team."
      : "Choose exactly one active Linear project. Represent shared work with a separate dependent Scope.");
  }
  const requested = projectNames[0];
  const exact = projects.filter((project) => project.name === requested);
  if (exact.length !== 1) {
    const caseInsensitive = projects.filter((project) => project.name.toLocaleLowerCase() === requested.toLocaleLowerCase());
    if (caseInsensitive.length === 1) throw new LinearBoundaryValidationError(`Linear project names are exact. Select “${caseInsensitive[0].name}” and retry.`);
    throw new LinearBoundaryValidationError(`“${requested}” is not one current project on Linear team ${teamKey}. Refresh the project list and choose an active project.`);
  }
  return { teamKey, projectNames: [exact[0].name], projectId: exact[0].id, detail: `Validated Linear boundary: team ${teamKey} · project ${exact[0].name} (${exact[0].id}).` };
}

/**
 * Resolve the execution owner boundary without widening it. Signal requires
 * one explicit, currently visible Linear project: an empty list means "all
 * projects" to the issue query and is therefore never a valid owner binding.
 */
export async function validateLinearBoundary(
  teamKeyInput: string | undefined,
  projectNamesInput: string[] | undefined
): Promise<ValidatedLinearBoundary> {
  const teamKey = teamKeyInput?.trim() ?? "";
  const projectNames = [...new Set((projectNamesInput ?? []).map((name) => name.trim()).filter(Boolean))];
  // Validate local shape before making a provider call.
  if (!teamKey || projectNames.length !== 1) return resolveLinearBoundary(teamKeyInput, projectNamesInput, []);

  let projects: LinearProjectSummary[];
  try {
    projects = await listTeamProjects(teamKey);
  } catch (error) {
    throw new LinearBoundaryValidationError(
      `Signal could not validate Linear team ${teamKey}: ${error instanceof Error ? error.message : "provider unavailable"}. Retry when Linear is available.`
    );
  }
  return resolveLinearBoundary(teamKey, projectNames, projects);
}

// Powers the Scope form's dropdowns so team key / project name can't be
// mistyped -- both are exact-match filters in getScopedIssues above.
export async function listTeams(): Promise<LinearTeamSummary[]> {
  const client = getClient();
  const teams: LinearTeamSummary[] = [];
  let connection = await client.teams({ first: 100 });

  while (true) {
    teams.push(...connection.nodes.map((t) => ({ key: t.key, name: t.name })));
    if (!connection.pageInfo.hasNextPage) break;
    connection = await connection.fetchNext();
  }

  return teams.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listTeamProjects(teamKey: string): Promise<LinearProjectSummary[]> {
  const client = getClient();
  const teams = await client.teams({ filter: { key: { eq: teamKey } } });
  const team = teams.nodes[0];
  if (!team) throw new Error(`No Linear team found with key "${teamKey}"`);

  const projects: LinearProjectSummary[] = [];
  let connection = await team.projects({ first: 100 });

  while (true) {
    projects.push(...connection.nodes.map((p) => ({ id: p.id, name: p.name })));
    if (!connection.pageInfo.hasNextPage) break;
    connection = await connection.fetchNext();
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

async function getTeamId(teamKey: string): Promise<string> {
  const client = getClient();
  const teams = await client.teams({ filter: { key: { eq: teamKey } } });
  const team = teams.nodes[0];
  if (!team) throw new Error(`No Linear team found with key "${teamKey}"`);
  return team.id;
}

async function ensureKitFoundLabelId(teamId: string): Promise<string> {
  const client = getClient();
  const existing = await client.issueLabels({
    filter: { team: { id: { eq: teamId } }, name: { eq: KIT_FOUND_LABEL } },
  });
  if (existing.nodes[0]) return existing.nodes[0].id;

  const payload = await client.createIssueLabel({
    name: KIT_FOUND_LABEL,
    teamId,
    color: "#0D7A5F",
    description: "Surfaced by KIT Gap Audit",
  });
  const label = await payload.issueLabel;
  if (!label) throw new Error("Failed to create the kit-found label in Linear");
  return label.id;
}

export interface CreateLinearIssueInput {
  title: string;
  description: string;
  teamKey: string;
}

export interface CreatedLinearIssue {
  id: string;
  identifier: string;
  url: string;
}

// Creates a real Linear issue labeled kit-found, used by the Draft ticket action.
export async function createLinearIssue(
  input: CreateLinearIssueInput
): Promise<CreatedLinearIssue> {
  const client = getClient();
  const teamId = await getTeamId(input.teamKey);
  const labelId = await ensureKitFoundLabelId(teamId);

  const payload = await client.createIssue({
    teamId,
    title: input.title,
    description: input.description,
    labelIds: [labelId],
  });
  const issue = await payload.issue;
  if (!issue) throw new Error("Failed to create Linear issue");

  return { id: issue.id, identifier: issue.identifier, url: issue.url };
}
