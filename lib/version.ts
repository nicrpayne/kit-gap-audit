// WHAT COMMIT IS THIS PROCESS ACTUALLY RUNNING?
//
// -- THE DEFECT THIS EXISTS TO END --------------------------------------
//
// Twice now a UX audit has been performed against a production build that
// was not the build anyone thought it was, and both times the only way to
// find out was to infer it: compare a screenshot against a local one, read a
// deployment timestamp, look for a feature and reason backwards. That is
// archaeology, and it is wrong every time it is not merely slow.
//
// A running process knows its own commit. It should say so.
//
// -- RUNTIME AUTHORITY, NOT BUILD-TIME GUESSWORK ------------------------
//
// Railway injects the git identity of the deploy into the process
// environment. That is the authority: it is set by whatever actually
// deployed, it cannot be stale relative to the container it lives in, and it
// needs no git binary, no `.git` directory in the image, and no shelling out
// at request time.
//
// Read once, at module load, into a frozen object. The values cannot change
// while a process lives, so re-reading per request would buy nothing.
//
// -- AND NOTHING ELSE -------------------------------------------------
//
// This module names the six variables it reads and returns a fixed shape.
// It never spreads `process.env`, never takes a key from a caller, and never
// grows a passthrough. That is the property that makes the endpoint safe to
// serve without auth: it cannot be made to disclose anything but these.

export interface BuildIdentity {
  /** Full 40-character SHA, or "local" when nothing deployed this. */
  commit: string;
  /** The first seven, which is what a human reads and a screenshot shows. */
  shortCommit: string;
  branch: string;
  /** The commit's SUBJECT LINE ONLY, capped. This repo's messages are
      multi-paragraph essays; a build marker wants the one line, and the SHA
      is there for anyone who wants the rest. */
  commitMessage: string;
  deploymentId: string;
  /** Railway's environment name where there is one, else NODE_ENV. */
  environment: string;
}

const SUBJECT_MAX = 200;

/** Trim, take the first line, cap it. Empty becomes the fallback. */
function subject(raw: string | undefined, fallback: string): string {
  const line = (raw ?? "").split("\n")[0].trim();
  if (!line) return fallback;
  return line.length > SUBJECT_MAX ? `${line.slice(0, SUBJECT_MAX - 1)}…` : line;
}

function clean(raw: string | undefined, fallback: string): string {
  const v = (raw ?? "").trim();
  return v || fallback;
}

/**
 * Read once. A deployed process cannot change commit without restarting, so
 * this is a constant for the life of the container — and computing it per
 * request would be pretending otherwise.
 */
function read(): BuildIdentity {
  const commit = clean(process.env.RAILWAY_GIT_COMMIT_SHA, "local");
  return Object.freeze({
    commit,
    // "local" is already short enough to be its own marker; a slice of it
    // would read as a SHA that happens to spell a word.
    shortCommit: commit === "local" ? "local" : commit.slice(0, 7),
    branch: clean(process.env.RAILWAY_GIT_BRANCH, "local"),
    commitMessage: subject(process.env.RAILWAY_GIT_COMMIT_MESSAGE, "working tree"),
    deploymentId: clean(process.env.RAILWAY_DEPLOYMENT_ID, "local"),
    environment: clean(
      process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.RAILWAY_ENVIRONMENT,
      process.env.NODE_ENV ?? "development"
    ),
  });
}

export const BUILD: BuildIdentity = read();

/** The keys the endpoint may serve. Anything not on this list cannot leave
    the process through this route, whatever a future edit adds to the type. */
export const BUILD_FIELDS = [
  "commit",
  "shortCommit",
  "branch",
  "commitMessage",
  "deploymentId",
  "environment",
] as const;

/** The wire shape, built by allowlist rather than by serialising an object.
    A field added to `BuildIdentity` without being added here is not exposed,
    which is the correct default for an unauthenticated route. */
export function buildPayload(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of BUILD_FIELDS) out[k] = BUILD[k];
  return out;
}
