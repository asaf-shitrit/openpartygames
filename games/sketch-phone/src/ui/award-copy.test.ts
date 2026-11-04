import { describe, expect, it } from "vitest";
import type { Award } from "@opg/protocol";
import { en } from "@opg/i18n";
import { sketchPhoneAwardCopy } from "./award-copy";

function award(id: string, value: number): Award {
  return { id, playerIds: ["maya"], value };
}

describe("sketchPhoneAwardCopy", () => {
  it("names each award Sketch Phone can hand out", () => {
    expect(sketchPhoneAwardCopy(award("favourite", 3), en)?.title).toBe("Favourite");
    expect(sketchPhoneAwardCopy(award("sharpest-pencil", 2), en)?.title).toBe("Sharpest pencil");
    expect(sketchPhoneAwardCopy(award("wordsmith", 1), en)?.title).toBe("Wordsmith");
  });

  it("counts the people in the singular, the dual and the plural", () => {
    expect(sketchPhoneAwardCopy(award("favourite", 1), en)?.detail).toBe("1 person voted for your links");
    expect(sketchPhoneAwardCopy(award("favourite", 2), en)?.detail).toBe("2 people voted for your links");
    expect(sketchPhoneAwardCopy(award("wordsmith", 5), en)?.detail).toBe("5 people voted for your words");
  });

  it("returns null for an award it does not know", () => {
    expect(sketchPhoneAwardCopy(award("word-thief", 3), en)).toBeNull();
  });
});
