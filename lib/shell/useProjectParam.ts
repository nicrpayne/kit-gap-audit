"use client";

// THE SELECTED PROJECT LIVES IN THE URL.
//
// Five instruments each kept their selection in component state, so the URL
// never changed. QA found what that costs: choose Platform on Forecast,
// refresh, and you are looking at JSA — silently, because nothing about the
// address said otherwise. You could not share what you were looking at, the
// back button did nothing, and a refresh could move you to a different
// project's forecast without saying so. In a product whose entire purpose is
// getting people to look at the same number together, "here is the link" did
// not work.
//
// This is the one convention, deliberately shared rather than five
// implementations that drift. The URL is the source of truth; nothing here
// mirrors it into state.
//
// ?project=<scopeId>
//
// Chosen over ?scope= because "scope" is an internal model name and the URL
// is the most user-facing surface Signal has. The internal code keeps
// calling it a Scope; the address bar says what a person would say.

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const PROJECT_PARAM = "project";

export interface ProjectParam {
  /** The resolved selection: the URL's value when valid, otherwise the
      deterministic fallback. Null only while the caller has no options. */
  projectId: string | null;
  /** True when the URL named something that is not an available project —
      a deleted scope, a typo, a stale link. The caller is showing the
      fallback and may want to say so. */
  invalid: boolean;
  /** Select a project. Pushes, so back and forward move through
      selections the way a person expects. */
  select: (id: string) => void;
}

/**
 * @param available Ids the caller can actually show, in priority order —
 *   `null` while they are still loading, which suppresses normalisation so
 *   a valid param is never rewritten before it can be validated.
 */
/** Orbit accepted ?focus=<scopeId> from the Control Room before this
    convention existed, and those links are still emitted in three places.
    Read as an alias rather than rewritten: a URL already in someone's
    history or pasted into a Slack thread should keep working, and the
    normalisation below quietly upgrades it to ?project= on arrival. */
const LEGACY_ALIASES = ["focus"] as const;

export function useProjectParam(available: string[] | null): ProjectParam {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw =
    params.get(PROJECT_PARAM) ?? LEGACY_ALIASES.map((k) => params.get(k)).find(Boolean) ?? null;

  const { projectId, invalid } = useMemo(() => {
    if (available === null) return { projectId: raw, invalid: false };
    if (available.length === 0) return { projectId: null, invalid: false };
    if (raw && available.includes(raw)) return { projectId: raw, invalid: false };
    // DETERMINISTIC FALLBACK: always the first available id, never "whatever
    // loaded first". An unrecognised value is reported rather than swallowed.
    return { projectId: available[0], invalid: Boolean(raw) };
  }, [raw, available]);

  // Make the address honest. Landing on /forecast with no param shows the
  // first project, so the URL should say which one — otherwise copying it
  // sends someone to a different project than the sender is looking at.
  // REPLACE, not push: this corrects the current entry rather than adding a
  // spurious one behind the user's first Back press.
  useEffect(() => {
    if (available === null || available.length === 0 || !projectId) return;
    if (raw === projectId) return;
    const next = new URLSearchParams(params.toString());
    next.set(PROJECT_PARAM, projectId);
    // Drop the legacy key once it has been honoured, so the address settles
    // on one spelling instead of carrying both around.
    LEGACY_ALIASES.forEach((k) => next.delete(k));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [available, projectId, raw, params, pathname, router]);

  const select = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params.toString());
      if (raw && raw !== id) {
        // A selected canonical object belongs to the project it was opened
        // from. Carrying it into a deliberate project switch produces an
        // impossible project/object pair, so only the project changes and
        // object identity returns to the unselected state.
        next.delete("select");
        next.delete("decisionId");
        next.delete("findingId");
      }
      next.set(PROJECT_PARAM, id);
      // PUSH, so back and forward walk the selections. Replace would make
      // the back button skip past everything the user did on this page.
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router, raw]
  );

  return { projectId, invalid, select };
}
