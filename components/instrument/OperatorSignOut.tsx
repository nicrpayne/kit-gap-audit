"use client";

import { useState } from "react";

export default function OperatorSignOut() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function signOut() {
    if (
      !window.confirm(
        "Sign out of Signal? Save any unsaved form changes first. Saved reports and Scenarios will remain unchanged.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign-out failed. Please retry.");
      // Do not clear browser storage: the tab may hold a recoverable Scenario.
      window.location.assign("/login");
    } catch {
      setError("Sign-out failed. Please retry.");
      setBusy(false);
    }
  }
  return (
    <>
      <button
        onClick={signOut}
        disabled={busy}
        aria-label="Sign out of Signal"
        className="signal-shell__nav-item flex w-[76px] flex-col items-center gap-[5px] rounded-[8px] py-[9px] transition-colors"
      >
        <span aria-hidden className="text-[12px] leading-none">
          ↪
        </span>
        <span className="text-[9.5px] leading-none">{busy ? "Signing out…" : "Sign out"}</span>
      </button>
      {error && (
        <p role="alert" className="max-w-[76px] px-1 text-[10px] text-[var(--i-red)]">
          {error}
        </p>
      )}
    </>
  );
}
