// Locale primitives: which locales exist, their writing direction, and the
// plural-category rule each one uses. No UI or dictionary content lives here.

export const LOCALES = ["en", "he"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Each locale's name written in that locale. A picker labelled "Hebrew" in English is
 * no use to someone who only reads Hebrew, so a language never names itself in another
 * language. Not in the dictionaries: these read the same whatever the current locale is.
 */
export const LOCALE_NAMES = {
  en: "English",
  he: "עברית",
} satisfies Record<Locale, string>;

export type Direction = "ltr" | "rtl";

export const LOCALE_DIRECTION = {
  en: "ltr",
  he: "rtl",
} satisfies Record<Locale, Direction>;

export function directionFor(locale: Locale): Direction {
  return LOCALE_DIRECTION[locale];
}

/**
 * CLDR-style plural categories, simplified to the ones English and Hebrew
 * actually use here. Hebrew distinguishes "two" from "many" in the general
 * case (10, 20, ... take "many"); this app only ever pluralizes small counts
 * (votes, players), so "many" collapses into "other".
 */
export type PluralCategory = "one" | "two" | "other";

export function pluralCategory(locale: Locale, count: number): PluralCategory {
  const n = Math.abs(count);
  if (locale === "he" && n === 2) return "two";
  if (n === 1) return "one";
  return "other";
}

export type PluralForms = { one: string; other: string; two?: string };

export function pickPlural(locale: Locale, count: number, forms: PluralForms): string {
  const category = pluralCategory(locale, count);
  if (category === "two") return forms.two ?? forms.other;
  return forms[category];
}

/**
 * Picks a plural form from the count alone, with no `Locale` in hand. Correct for every
 * locale this app ships (`pluralCategory` only ever puts a count of exactly 2, and only for
 * `he`, in the "two" category — the same condition this checks directly), but a genuinely
 * locale-aware caller should prefer `pickPlural`. Kept for call sites that only have a
 * `Dictionary`, not a `Locale`.
 */
export function pickPluralByCount(count: number, forms: PluralForms): string {
  const n = Math.abs(count);
  if (n === 2 && forms.two !== undefined) return forms.two;
  if (n === 1) return forms.one;
  return forms.other;
}
