/**
 * Validate a browser origin used by CORS or the public frontend configuration.
 * Require canonical origin syntax: no paths, credentials, query, or fragment.
 */
export function isValidPublicHttpsOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:"
      && parsed.origin === value
      && !parsed.username
      && !parsed.password
      && hostname !== "localhost"
      && hostname !== "127.0.0.1"
      && hostname !== "::1"
      && hostname !== "[::1]";
  } catch {
    return false;
  }
}
