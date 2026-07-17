"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Incorrect password.");
      }
      router.push(params.get("next") ?? "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--color-paper)]">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-[var(--color-card)] border border-[var(--color-line)] rounded-xl p-8 shadow-sm"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-md bg-[var(--color-accent)] flex items-center justify-center font-display text-lg font-semibold text-white">
            K
          </div>
          <div className="font-display text-xl">KIT Gap Audit</div>
        </div>
        <label className="block text-sm text-[var(--color-ink-soft)] mb-2">
          Password
        </label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-[var(--color-line)] bg-white px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        {error && (
          <div className="text-sm text-[var(--color-danger)] mb-4">{error}</div>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full rounded-md bg-[var(--color-accent)] text-white py-2 text-sm font-medium hover:bg-[var(--color-accent-dark)] disabled:opacity-50"
        >
          {loading ? "Checking…" : "Enter"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
