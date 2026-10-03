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

  it("hyphenates a Hebrew prefix letter glued to a Latin or digit value", () => {
    expect(format("התור עובר ל{name}", { name: "Dana" })).toBe("התור עובר ל-Dana");
    expect(format("{a} ו{b}", { a: "אבי", b: "Sam2" })).toBe("אבי ו-Sam2");
    expect(format("בחרתם ב{name}.", { name: "7up" })).toBe("בחרתם ב-7up.");
  });

  it("leaves a Hebrew prefix alone before a Hebrew value or an existing hyphen", () => {
    expect(format("התור עובר ל{name}", { name: "דנה" })).toBe("התור עובר לדנה");
    expect(format("החדר בחר ב{name}", { name: "ה-VIP" })).toBe("החדר בחר בה-VIP");
  });

  it("does not hyphenate after a space or in English text", () => {
    expect(format("{name} בחר", { name: "Dana" })).toBe("Dana בחר");
    expect(format("a{name}", { name: "Dana" })).toBe("aDana");
  });

  it("hyphenates only a real prefix run at the start of a word", () => {
    expect(format("שלום{name}", { name: "Dana" })).toBe("שלוםDana");
    expect(format("מחכים ל{name}", { name: "Dana" })).toBe("מחכים ל-Dana");
    expect(format("(וב{name})", { name: "Dana" })).toBe("(וב-Dana)");
    expect(format("{a} ו{b}", { a: "x", b: "Sam" })).toBe("x ו-Sam");
  });

  it("hyphenates before accented Latin and before an LTR isolate", () => {
    expect(format("ל{name}", { name: "Émile" })).toBe("ל-Émile");
    expect(format("ל{name}", { name: "\u2066+5\u2069" })).toBe("ל-\u2066+5\u2069");
  });
});
