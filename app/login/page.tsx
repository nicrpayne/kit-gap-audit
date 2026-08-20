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
    // The first thing anyone sees. It said KIT Gap Audit in Workbench green
    // while that was the product; the product is Signal, and the door has
    // to look like the building.
    <div
      className="i-legacy flex min-h-screen w-full items-center justify-center px-6"
      style={{ background: "var(--i-void)" }}
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-[12px] p-8"
        style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
      >
        <div className="mb-7 flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[9px] font-display text-lg font-semibold"
            style={{
              background: "var(--i-panel-raised)",
              border: "1px solid var(--i-border-strong)",
              color: "var(--i-signal)",
            }}
          >
            S
          </div>
          <div>
            <div className="font-display text-xl leading-tight text-[var(--i-text)]">Signal</div>
            <div className="i-label mt-1">KIT</div>
          </div>
        </div>
        <label className="mb-2 block text-[12px] text-[var(--i-text-soft)]">Password</label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-md border px-3 py-2 text-sm"
        />
        {error && <div className="mb-4 text-[12px] text-[var(--i-red)]">{error}</div>}
        <button type="submit" disabled={loading || !password} className="i-btn-primary w-full py-2 text-sm">
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
