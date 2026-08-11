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
}

export interface LinearIssueSummary {
  identifier: string;
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
        title
        description
        estimate
        completedAt
        state { name type }
        assignee { name }
        labels { nodes { name } }
      }
    }
  }
`;

interface ScopedIssuesQueryData {
  issues: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      identifier: string;
      title: string;
      description: string | null;
      estimate: number | null;
      completedAt: string | null;
      state: { name: string; type: string } | null;
      assignee: { name: string } | null;
      labels: { nodes: { name: string }[] };
    }[];
  };
}

// Refreshing the Forecast page shouldn't cost a fresh Linear read every
// time -- issues don't change minute to minute. Small in-process TTL cache;
// fine on Railway where next start is one long-lived process.
const ISSUE_CACHE_TTL_MS = 2 * 60 * 1000;
const issueCache = new Map<string, { at: number; issues: LinearIssueSummary[] }>();

// All non-canceled issues matching a Scope: team key, optionally narrowed by
// one or more Linear project names (union -- e.g. a product Scope pulling
// its own project plus shared Platform work) and/or a label. Scopes are
// data (see Scope model), not env vars, so a new module (Precon, Design,
// ...) is a new row, not a redeploy.
export async function getScopedIssues(scope: ScopeFilter): Promise<LinearIssueSummary[]> {
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
        title: node.title,
        description: node.description ? node.description.slice(0, 500) : null,
        state: node.state?.name ?? "Unknown",
        stateType: node.state?.type ?? "unstarted",
        estimate: node.estimate ?? null,
        assignee: node.assignee?.name ?? null,
        labels: node.labels.nodes.map((l) => l.name),
        completedAt: node.completedAt ?? null,
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
