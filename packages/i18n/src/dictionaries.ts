import type { Locale } from "./locale";
import { en } from "./en";
import { he } from "./he";
import type { Dictionary } from "./dictionary";

export const DICTIONARIES = { en, he } satisfies Record<Locale, Dictionary>;

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
