/** Login destinations must remain inside Signal, even for manually edited URLs. */
export function safeReturnPath(candidate: string | null): string {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(candidate)
  )
    return "/";
  const base = "https://signal.invalid";
  try {
    const parsed = new URL(candidate, base);
    return parsed.origin === base ? parsed.pathname + parsed.search + parsed.hash : "/";
  } catch {
    return "/";
  }
}
