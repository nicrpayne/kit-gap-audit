export interface DisposableDatabaseProofTarget {
  url: URL;
  databaseName: string;
  port: string;
}

/** Pure, connection-free authorization check for destructive local proofs. */
export function assertDisposableDatabaseProofEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  optInVariable: string,
): DisposableDatabaseProofTarget {
  if (env[optInVariable] !== "1") {
    throw new Error(`Refusing to write: set ${optInVariable}=1 only for a disposable loopback PostgreSQL database.`);
  }
  const rawDatabaseUrl = env.DATABASE_URL;
  if (!rawDatabaseUrl) throw new Error("Refusing to write: DATABASE_URL is required.");
  let url: URL;
  try {
    url = new URL(rawDatabaseUrl);
  } catch {
    throw new Error("Refusing to write: DATABASE_URL must be a valid URL.");
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !loopbackHosts.has(url.hostname) ||
    !url.port ||
    decodeURIComponent(url.username) !== "signal_t0_local" ||
    !/^signal_t0_test_[0-9]+$/.test(databaseName)
  ) {
    throw new Error("Refusing to write: DATABASE_URL must use signal_t0_local and the exact signal_t0_test_<pid> database contract on loopback with an explicit port.");
  }
  return { url, databaseName, port: url.port };
}
