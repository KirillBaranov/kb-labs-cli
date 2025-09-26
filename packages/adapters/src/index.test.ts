import { describe, it, expect } from "vitest";

describe("Adapters", () => {
  it("should be importable", () => {
    expect(() => import("./index")).not.toThrow();
  });
});
