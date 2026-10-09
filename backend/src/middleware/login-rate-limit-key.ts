import { ipKeyGenerator } from "express-rate-limit";

/**
 * Rate-limit one account per source IP, rather than globally locking an account.
 * A global email-only bucket lets an unauthenticated attacker deny a victim
 * access by intentionally exhausting the victim's login budget.
 */
export function loginAccountRateLimitKey(emailInput: unknown, ipInput: string | undefined): string {
  const email = typeof emailInput === "string" ? emailInput.trim().toLowerCase() : "";
  const ip = ipInput ? ipKeyGenerator(ipInput) : "unknown";
  return `${ip}:${email || "<missing-email>"}`;
}
