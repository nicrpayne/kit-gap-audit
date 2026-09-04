// THE CROSS-INSTRUMENT HANDOFF CONTRACT.
//
// Project identity belongs in the URL and must survive every move between
// instruments. Selection and scenario keys are carried only when they are
// already explicit; consumers that understand them restore them, while the
// others safely leave them untouched for Back/Forward and the next handoff.

export const PROJECT_KEYS = ["project", "focus", "scope", "scopeId"] as const;
export const CARRIED_CONTEXT_KEYS = ["select", "decisionId", "findingId", "scenario", "scenarioId"] as const;

export function projectFromParams(params: URLSearchParams): string | null {
  for (const key of PROJECT_KEYS) {
    const value = params.get(key);
    if (value) return value;
  }
  return null;
}

/** Add missing Signal context to an internal application href. Explicit
 * target context always wins. External, hash-only and API links are left
 * untouched. */
export function contextualHref(href: string, current: URLSearchParams | string): string {
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/")) return href;
  const currentParams = typeof current === "string" ? new URLSearchParams(current) : current;
  const [pathAndQuery, hash = ""] = href.split("#", 2);
  const [path, query = ""] = pathAndQuery.split("?", 2);
  const target = new URLSearchParams(query);

  if (!projectFromParams(target)) {
    const project = projectFromParams(currentParams);
    if (project) target.set("project", project);
  }
  for (const key of CARRIED_CONTEXT_KEYS) {
    if (!target.has(key)) {
      const value = currentParams.get(key);
      if (value) target.set(key, value);
    }
  }

  const next = target.toString();
  return `${path}${next ? `?${next}` : ""}${hash ? `#${hash}` : ""}`;
}

