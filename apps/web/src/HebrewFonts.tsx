// Neither Permanent Marker nor Atkinson Hyperlegible has Hebrew glyphs, so Hebrew needs its
// own pair. Importing them from the kit's stylesheet would ship both to every English player
// for glyphs they never render, so they are fetched only once Hebrew is actually chosen.
//
// This lives in the app rather than in @opg/i18n because a side-effect CSS import is a
// bundler concern: the shared package has no business knowing how fonts reach a page.
import { useEffect } from "react";
import { useLocale } from "@opg/i18n";

let started = false;

/** Renders nothing. Fetches the Hebrew faces the first time the locale is Hebrew. */
export function HebrewFonts() {
  const { locale } = useLocale();
  useEffect(() => {
    if (locale !== "he" || started) return;
    started = true;
    void Promise.all([
      import("@fontsource/secular-one/400.css"),
      import("@fontsource/heebo/400.css"),
      import("@fontsource/heebo/700.css"),
    ]);
  }, [locale]);
  return null;
}
