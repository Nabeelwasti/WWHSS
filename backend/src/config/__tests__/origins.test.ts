import { describe, expect, it } from "vitest";
import { isValidPublicHttpsOrigin } from "../origins.js";

describe("public HTTPS origin validation", () => {
  it("accepts canonical HTTPS origins", () => {
    expect(isValidPublicHttpsOrigin("https://school.example")).toBe(true);
    expect(isValidPublicHttpsOrigin("https://school.example:8443")).toBe(true);
  });

  it.each([
    "http://school.example",
    "https://school.example/",
    "https://school.example/admin",
    "https://user:secret@school.example",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "not-a-url",
  ])("rejects unsafe or non-canonical origin %s", (origin) => {
    expect(isValidPublicHttpsOrigin(origin)).toBe(false);
  });
});
