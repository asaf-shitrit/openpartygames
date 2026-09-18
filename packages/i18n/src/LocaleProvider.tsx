import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { directionFor, LOCALES, type Direction, type Locale } from "./locale";
import { dictionaryFor } from "./dictionaries";
import type { Dictionary } from "./dictionary";

export interface LocaleValue {
  locale: Locale;
  dir: Direction;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleValue | null>(null);

const STORAGE_KEY = "opg:locale";

function isLocale(value: string | null): value is Locale {
  return value !== null && LOCALES.some((locale) => locale === value);
}

/**
 * `?lang=he` wins (handy for previewing a locale without touching storage), then a saved
 * preference, then English.
 *
 * The browser's own language is deliberately NOT consulted yet. Direction is set on the
 * document, so picking Hebrew mirrors every screen — including the dozen not translated
 * yet, which would leave someone whose browser is set to Hebrew reading English words in a
 * right-to-left layout on most of the product. Until the remaining surfaces are translated,
 * Hebrew is something you choose, not something that happens to you. Read `navigator.language`
 * here once that is done.
 *
 * Exported for direct testing of each branch — mounting a component to exercise it would
 * mean faking `window` itself.
 */
export function initialLocale(): Locale {
  if (!("window" in globalThis)) return "en";
  const fromQuery = new URLSearchParams(window.location.search).get("lang");
  if (isLocale(fromQuery)) return fromQuery;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage can throw in private browsing; fall through.
  }
  return "en";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const dir = directionFor(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore: the in-memory locale still updates.
    }
  }, []);

  const value = useMemo<LocaleValue>(
    () => ({ locale, dir, t: dictionaryFor(locale), setLocale }),
    [locale, dir, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext);
  if (value === null) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return value;
}
