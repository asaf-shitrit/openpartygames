import { describe, expect, it } from "vitest";
import { joinNamesAnd, joinNamesOr } from "./join-names";
import { en } from "./dictionary";
import { he } from "./he";

describe("joinNamesAnd", () => {
  it("returns the single name unchanged", () => {
    expect(joinNamesAnd(en.common, ["Ava"])).toBe("Ava");
  });

  it("joins two names with the locale conjunction", () => {
    expect(joinNamesAnd(en.common, ["Ava", "Bo"])).toBe("Ava and Bo");
    expect(joinNamesAnd(he.common, ["Ava", "Bo"])).toBe("Ava וBo");
  });

  it("joins three or more names with a comma list and a final conjunction", () => {
    expect(joinNamesAnd(en.common, ["Ava", "Bo", "Cy"])).toBe("Ava, Bo and Cy");
  });
});

describe("joinNamesOr", () => {
  it("joins two names with the locale disjunction", () => {
    expect(joinNamesOr(en.common, ["Ava", "Bo"])).toBe("Ava or Bo");
  });

  it("returns empty string for an empty list", () => {
    expect(joinNamesOr(en.common, [])).toBe("");
  });
});
