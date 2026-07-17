import { LinearClient, LinearDocument } from "@linear/sdk";

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
  projectName?: string | null;
  labelFilter?: string | null;
}

export interface LinearIssueSummary {
  identifier: string;
  title: string;
  description: string | null;
  state: string;
  estimate: number | null;
  assignee: string | null;
  labels: string[];
}

// All non-canceled issues matching a Scope: team key, optionally narrowed by
// Linear project name and/or a label. Scopes are data (see Scope model), not
// env vars, so a new module (Precon, Design, ...) is a new row, not a redeploy.
export async function getScopedIssues(scope: ScopeFilter): Promise<LinearIssueSummary[]> {
  const client = getClient();

  const filter: LinearDocument.IssueFilter = {
    team: { key: { eq: scope.teamKey } },
    state: { type: { nin: ["canceled"] } },
  };
  if (scope.projectName) {
    filter.project = { name: { eq: scope.projectName } };
  }
  if (scope.labelFilter) {
    filter.labels = { some: { name: { eq: scope.labelFilter } } };
  }

  const issues: LinearIssueSummary[] = [];
  let connection = await client.issues({ filter, first: 100 });

  while (true) {
    const details = await Promise.all(
      connection.nodes.map(async (issue) => {
        const [state, assignee, labelConnection] = await Promise.all([
          issue.state,
          issue.assignee,
          issue.labels(),
        ]);
        return {
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description ? issue.description.slice(0, 500) : null,
          state: state?.name ?? "Unknown",
          estimate: issue.estimate ?? null,
          assignee: assignee?.name ?? null,
          labels: labelConnection.nodes.map((l) => l.name),
        };
      })
    );
    issues.push(...details);

    if (!connection.pageInfo.hasNextPage) break;
    connection = await connection.fetchNext();
  }

  return issues;
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
