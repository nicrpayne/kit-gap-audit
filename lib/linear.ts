import { LinearClient } from "@linear/sdk";

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

function requireTeamKey(teamKey?: string): string {
  const key = teamKey ?? process.env.LINEAR_TEAM_KEY;
  if (!key) throw new Error("LINEAR_TEAM_KEY is not set");
  return key;
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

// All non-canceled issues for the configured team: identifier, title,
// truncated description, state, estimate, assignee, labels.
export async function getTeamIssues(teamKey?: string): Promise<LinearIssueSummary[]> {
  const key = requireTeamKey(teamKey);
  const client = getClient();

  const issues: LinearIssueSummary[] = [];
  let connection = await client.issues({
    filter: {
      team: { key: { eq: key } },
      state: { type: { nin: ["canceled"] } },
    },
    first: 100,
  });

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
  teamKey?: string;
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
  const teamKey = requireTeamKey(input.teamKey);
  const client = getClient();
  const teamId = await getTeamId(teamKey);
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
