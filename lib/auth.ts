export const SESSION_COOKIE = "kit_session";

// Edge-compatible (Web Crypto) so this can run in middleware.
export async function sessionTokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`kit-gap-audit::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
