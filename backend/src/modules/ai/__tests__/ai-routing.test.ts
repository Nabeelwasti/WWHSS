import { describe, it, expect, vi } from "vitest";

vi.mock("../../../db/client.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    examResult: { findMany: vi.fn() },
  },
}));

import { classifyTask, orderByTier, type ProviderConfig } from "../ai.service.js";

describe("classifyTask", () => {
  it("classifies a short casual question as fast", () => {
    expect(classifyTask("what's my homework?")).toBe("fast");
  });

  it("classifies a request to explain in detail as smart", () => {
    expect(classifyTask("Can you explain photosynthesis in detail?")).toBe("smart");
  });

  it("classifies a very long message as smart regardless of wording", () => {
    const long = "tell me about school ".repeat(15); // > 220 chars
    expect(classifyTask(long)).toBe("smart");
  });

  it("classifies a short greeting as fast", () => {
    expect(classifyTask("hi")).toBe("fast");
  });
});

describe("orderByTier", () => {
  const fastA: ProviderConfig = { type: "gemini", apiKey: "k1", model: "m", tier: "fast" };
  const smartB: ProviderConfig = { type: "anthropic", apiKey: "k2", model: "m", tier: "smart" };
  const untagged: ProviderConfig = { type: "gemini", apiKey: "k3", model: "m" };

  it("puts the preferred tier first without dropping the others", () => {
    const result = orderByTier([smartB, fastA, untagged], "fast");
    expect(result[0]).toBe(fastA);
    expect(result).toHaveLength(3);
    expect(result).toContain(smartB);
    expect(result).toContain(untagged);
  });

  it("falls back to every provider, in original relative order, when none match the preferred tier", () => {
    const result = orderByTier([smartB, untagged], "fast");
    expect(result).toEqual([smartB, untagged]);
  });

  it("never loses a provider regardless of tier preference", () => {
    const all = [fastA, smartB, untagged];
    expect(orderByTier(all, "fast")).toHaveLength(3);
    expect(orderByTier(all, "smart")).toHaveLength(3);
  });
});
