import { RequestValidationError, requiredString } from "@/lib/http/json";

export function parseScopeInput(body: Record<string, unknown>) {
  const name = requiredString(body.name, "name");
  const teamKey = requiredString(body.teamKey, "teamKey");
  let projectNames: string[] | undefined;
  if (body.projectNames !== undefined) {
    if (!Array.isArray(body.projectNames) || body.projectNames.length > 100) {
      throw new RequestValidationError("projectNames must be an array of at most 100 names");
    }
    projectNames = body.projectNames.map((value) => requiredString(value, "projectNames entry"));
  }
  const labelFilter =
    body.labelFilter === undefined || body.labelFilter === null || body.labelFilter === ""
      ? null
      : requiredString(body.labelFilter, "labelFilter");
  return { name, teamKey, projectNames, labelFilter };
}
