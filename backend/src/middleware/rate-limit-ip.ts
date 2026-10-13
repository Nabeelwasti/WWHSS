import ipaddr from "ipaddr.js";

/**
 * Build a stable rate-limit key for an IP address.
 * IPv6 addresses are grouped by /56 so privacy-address rotation within a
 * subnet cannot evade account-specific login throttling. IPv4 addresses are
 * normalized by ipaddr.js before being used as a key.
 */
export function normalizeRateLimitIp(ip: string): string {
  try {
    const address = ipaddr.parse(ip);
    if (address.kind() === "ipv6") {
      const prefix = address.toByteArray()
        .slice(0, 7)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      return `ipv6:${prefix}/56`;
    }
    return `ipv4:${address.toString()}`;
  } catch {
    return `invalid:${ip}`;
  }
}
