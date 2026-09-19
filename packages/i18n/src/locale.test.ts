import { describe, expect, it } from "vitest";
import { directionFor, pickPlural, pickPluralByCount, pluralCategory } from "./locale";

describe("directionFor", () => {
  it("is ltr for English", () => {
    expect(directionFor("en")).toBe("ltr");
  });

  it("is rtl for Hebrew", () => {
    expect(directionFor("he")).toBe("rtl");
  });
});

describe("pluralCategory", () => {
  it("treats 1 as one in both locales", () => {
    expect(pluralCategory("en", 1)).toBe("one");
    expect(pluralCategory("he", 1)).toBe("one");
  });

  it("treats 2 as two only in Hebrew", () => {
    expect(pluralCategory("en", 2)).toBe("other");
    expect(pluralCategory("he", 2)).toBe("two");
  });

  it("treats other counts as other", () => {
    expect(pluralCategory("en", 5)).toBe("other");
    expect(pluralCategory("he", 5)).toBe("other");
  });
});

describe("pickPlural", () => {
  const forms = { one: "{count} vote", other: "{count} votes" };

  it("picks one for a count of 1", () => {
    expect(pickPlural("en", 1, forms)).toBe("{count} vote");
  });

  it("falls back to other when two has no form", () => {
    expect(pickPlural("he", 2, forms)).toBe("{count} votes");
  });

  it("uses a two form when supplied", () => {
    expect(pickPlural("he", 2, { ...forms, two: "{count} pair" })).toBe("{count} pair");
  });
});

describe("pickPluralByCount", () => {
  const forms = { one: "{count} vote", other: "{count} votes" };

  it("picks one for a count of 1", () => {
    expect(pickPluralByCount(1, forms)).toBe("{count} vote");
  });

  it("falls back to other for 2 when no two form exists", () => {
    expect(pickPluralByCount(2, forms)).toBe("{count} votes");
  });

  it("uses a two form for a count of 2 when supplied", () => {
    expect(pickPluralByCount(2, { ...forms, two: "{count} pair" })).toBe("{count} pair");
  });

  it("picks other for larger counts", () => {
    expect(pickPluralByCount(5, forms)).toBe("{count} votes");
  });
});
