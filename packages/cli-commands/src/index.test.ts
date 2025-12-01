import { describe, it, expect } from "vitest";

describe("Commands", () => {
  it("should be importable", () => {
    expect(() => import("./index")).not.toThrow();
  });
});
