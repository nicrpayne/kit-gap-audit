"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDbError = /ECONNREFUSED|P1001|Can't reach database/i.test(error.message);

  return (
    <div className="p-10 max-w-xl">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-danger)] mb-2">
        Something went wrong
      </div>
      <h1 className="font-display text-2xl mb-3">
        {isDbError ? "Can't reach the database" : "That didn't load"}
      </h1>
      <p className="text-sm text-[var(--color-ink-soft)] mb-6">
        {isDbError
          ? "Check that DATABASE_URL is set and the Postgres service is running."
          : error.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-[var(--color-accent)] text-white px-4 py-2 text-sm font-medium hover:bg-[var(--color-accent-dark)]"
      >
        Try again
      </button>
    </div>
  );
}
