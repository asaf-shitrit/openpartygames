// Every {placeholder} an English string carries must survive into its Hebrew twin.
//
// The `Dictionary` type derives from `en`, so a key that only exists in `he` is a type error
// and a key missing from `he` is too. Nothing checks inside the values. A Hebrew string that
// drops `{count}`, or spells it `{מספר}`, type-checks perfectly and renders the wrong text to
// a Hebrew player — silently, and only in the one locale the people writing the code are
// least likely to be reading.
import { describe, expect, it } from "vitest";
import { en } from "./dictionary";
import { he } from "./he";

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Keys where Hebrew deliberately spells the number out instead of interpolating it.
 *
 * `pickPluralByCount` routes to `.one` only at exactly 1 and `.two` only at exactly 2, so the
 * number is fixed and "הצבעה אחת" says the same thing as "{count} vote" would. Hebrew reads
 * better with the word than the digit here, which is the whole reason the dual form exists.
 *
 * Anything added to this list needs that same argument: the count must be structurally fixed
 * by the form itself. A `.other` form can never qualify.
 */
const SPELLED_OUT_IN_HEBREW = new Set([
  "mostLikelyTo.votes.one",
  "imposter.reveal.votes.one",
  "kit.crowns.two",
  "kit.doodle.strokes.two",
]);

/**
 * The placeholder names in a string, as a set. A set rather than a list because Hebrew
 * reorders freely — "{name}, the VIP removed you" against a sentence that puts the verb
 * first is the same string, correctly translated, with the placeholders in another order.
 */
function placeholdersIn(value: string): Set<string> {
  return new Set([...value.matchAll(PLACEHOLDER)].map((match) => match[1] ?? ""));
}

function sameNames(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((name) => b.has(name));
}

function show(names: Set<string>): string {
  return names.size === 0 ? "none" : [...names].map((n) => `{${n}}`).join("");
}

/**
 * What a dictionary is made of: strings at the leaves, nested groups above them. Spelled out
 * rather than walked as `unknown`, so the recursion below branches on a domain shape instead
 * of interrogating an untyped value at runtime.
 */
type DictNode = string | { readonly [key: string]: DictNode };

/** Every leaf string in a dictionary, keyed by its dotted path. */
function leaves(node: DictNode, path: string[], into: Map<string, string>): void {
  // `instanceof Object` rather than a typeof check: a string primitive is not an Object, so
  // this splits the union into its two real cases and TypeScript narrows both sides.
  if (!(node instanceof Object)) {
    into.set(path.join("."), node);
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    leaves(child, [...path, key], into);
  }
}

function leafMap(dictionary: DictNode): Map<string, string> {
  const found = new Map<string, string>();
  leaves(dictionary, [], found);
  return found;
}

describe("en/he placeholder parity", () => {
  const english = leafMap(en);
  const hebrew = leafMap(he);

  it("reads a dictionary that actually has strings in it", () => {
    // Guards the walker itself: a bug that returned nothing would make every check below pass.
    expect(english.size).toBeGreaterThan(300);
    expect(hebrew.size).toBe(english.size);
  });

  it("carries every English placeholder into the Hebrew string", () => {
    const mismatched = [...english]
      .filter(([key]) => !SPELLED_OUT_IN_HEBREW.has(key))
      .map(([key, value]) => ({
        key,
        en: placeholdersIn(value),
        he: placeholdersIn(hebrew.get(key) ?? ""),
      }))
      .filter((row) => !sameNames(row.en, row.he))
      .map((row) => `${row.key}: en has ${show(row.en)}, he has ${show(row.he)}`);
    expect(mismatched).toEqual([]);
  });

  it("keeps the spelled-out list honest", () => {
    // A key stops belonging here the moment Hebrew starts interpolating it, or the key goes
    // away. Either way the entry is stale and the next real mismatch would hide behind it.
    const stale = [...SPELLED_OUT_IN_HEBREW].filter((key) => {
      const source = english.get(key);
      const target = hebrew.get(key);
      if (source === undefined || target === undefined) return true;
      return sameNames(placeholdersIn(source), placeholdersIn(target));
    });
    expect(stale).toEqual([]);
  });

  it("never leaves a placeholder that no caller could fill", () => {
    // `format` leaves an unknown {placeholder} in place rather than throwing, so a typo ships
    // as literal braces on screen. A placeholder in Hebrew that English does not have is
    // exactly that case, and the parity check above only looks the other way.
    const extra = [...hebrew]
      .map(([key, value]) => ({
        key,
        only: [...placeholdersIn(value)].filter(
          (name) => !placeholdersIn(english.get(key) ?? "").has(name),
        ),
      }))
      .filter((row) => row.only.length > 0)
      .map(
        (row) =>
          `${row.key}: he has ${row.only.map((n) => `{${n}}`).join("")} with no English source`,
      );
    expect(extra).toEqual([]);
  });
});
