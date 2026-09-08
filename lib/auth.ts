export const SESSION_COOKIE = "kit_session";

// Edge-compatible (Web Crypto) so this can run in middleware.
export async function sessionTokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`kit-gap-audit::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// A one-way scoped credential derived from APP_PASSWORD. The derived value is
// accepted only by /api/bridge routes, so the companion never needs to retain
// the broader browser/API password after installation.
export async function bridgeTransportTokenFor(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("signal::bootstrap-companion::v1"));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
