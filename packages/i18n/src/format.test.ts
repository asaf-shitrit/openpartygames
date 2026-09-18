import { describe, expect, it } from "vitest";
import { format } from "./format";

describe("format", () => {
  it("returns the template unchanged with no params", () => {
    expect(format("Hello")).toBe("Hello");
  });

  it("substitutes named params", () => {
    expect(format("Hi, {name}!", { name: "Dov" })).toBe("Hi, Dov!");
  });

  it("substitutes numbers", () => {
    expect(format("{count} votes", { count: 3 })).toBe("3 votes");
  });

  it("leaves an unmatched placeholder untouched", () => {
    expect(format("{missing}", {})).toBe("{missing}");
  });
});
