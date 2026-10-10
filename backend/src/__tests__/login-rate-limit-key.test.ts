import { describe, expect, it } from "vitest";
import { loginAccountRateLimitKey } from "../middleware/login-rate-limit-key.js";

describe("loginAccountRateLimitKey", () => {
  it("normalizes email casing and whitespace for the same source IP", () => {
    expect(loginAccountRateLimitKey("  Admin@Example.com ", "203.0.113.10"))
      .toBe(loginAccountRateLimitKey("admin@example.com", "203.0.113.10"));
  });

  it("does not let one source IP exhaust another source IP's account bucket", () => {
    expect(loginAccountRateLimitKey("admin@example.com", "203.0.113.10"))
      .not.toBe(loginAccountRateLimitKey("admin@example.com", "203.0.113.11"));
  });

  it("keeps missing or invalid email attempts scoped to their source IP", () => {
    expect(loginAccountRateLimitKey(undefined, "203.0.113.10"))
      .toBe(loginAccountRateLimitKey("", "203.0.113.10"));
    expect(loginAccountRateLimitKey(undefined, "203.0.113.10"))
      .not.toBe(loginAccountRateLimitKey(undefined, "203.0.113.11"));
  });
});
