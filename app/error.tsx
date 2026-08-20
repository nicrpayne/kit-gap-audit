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
    <div className="min-h-screen p-10" style={{ background: "var(--i-void)" }}>
      <div className="mx-auto w-full max-w-[560px] pt-16">
        <div className="i-label mb-3" style={{ color: "var(--i-red)" }}>
          Something went wrong
        </div>
        <h1 className="font-display mb-3 text-[26px] leading-tight text-[var(--i-text)]">
          {isDbError ? "Can't reach the database" : "That didn't load"}
        </h1>
        <p className="mb-7 text-[13px] leading-[1.65] text-[var(--i-text-soft)]">
          {isDbError
            ? "Check that DATABASE_URL is set and the Postgres service is running."
            : error.message || "An unexpected error occurred."}
        </p>
        <button onClick={reset} className="i-btn-primary px-4 py-2 text-sm">
          Try again
        </button>
      </div>
    </div>
  );
}
