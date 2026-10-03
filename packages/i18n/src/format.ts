// Tiny `{name}` interpolation. No ICU, no plural syntax embedded in strings —
// pluralization is handled separately by pickPlural so each form stays a
// plain, readable string in the dictionary.

export type FormatParams = Record<string, string | number>;

const HEBREW_LETTER = /[\u05D0-\u05EA]/;
const STARTS_LATIN_OR_DIGIT = /^[A-Za-z0-9]/;

/**
 * Hebrew writes a one-letter prefix (ו, ב, ל…) glued to a Latin word or number with a hyphen:
 * "ל-Dana", never "לDana". A player picks their own name, so the dictionary cannot know which
 * script it will meet; the hyphen is added here, only when the prefix letter sits directly
 * against the placeholder and the value starts in Latin or a digit.
 */
function prefixed(before: string, value: string): string {
  return HEBREW_LETTER.test(before) && STARTS_LATIN_OR_DIGIT.test(value) ? "-" : "";
}

export function format(template: string, params?: FormatParams): string {
  if (!params) return template;
  return template.replace(/(.?)\{(\w+)\}/g, (match, before: string, key: string) => {
    const raw = params[key];
    if (raw === undefined) return match;
    const value = String(raw);
    return `${before}${prefixed(before, value)}${value}`;
  });
}
