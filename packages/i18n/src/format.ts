// Tiny `{name}` interpolation. No ICU, no plural syntax embedded in strings —
// pluralization is handled separately by pickPlural so each form stays a
// plain, readable string in the dictionary.

export type FormatParams = Record<string, string | number>;

const STARTS_LATIN_OR_DIGIT = /^(?:[\p{Script=Latin}0-9]|\u2066)/u;

/**
 * Hebrew writes a one-letter prefix (ו, ב, ל, ה, מ, ש, כ) glued to a Latin word or number with
 * a hyphen: "ל-Dana", never "לDana". A player picks their own name, so the dictionary cannot
 * know which script it will meet. The hyphen is added only when a run of prefix letters that
 * starts a word sits against the placeholder ("שלום{name}" is a word, not a prefix) and the
 * value starts in Latin, a digit, or an LTR isolate.
 */
function hyphenFor(prefix: string | undefined, value: string): string {
  return prefix !== undefined && STARTS_LATIN_OR_DIGIT.test(value) ? "-" : "";
}

/**
 * One prefix letter, or one of the few pairs that are only ever prefixes. Pairs that are also
 * whole words (של, מה, כמה, כמו, שלו, מול) are left out on purpose: "של{name}" is the word "of".
 */
const PREFIX_RUN = "[\\u05D5\\u05D1\\u05DC\\u05D4\\u05DE\\u05E9\\u05DB]|\\u05D5\\u05D1|\\u05D5\\u05DC|\\u05D5\\u05DE|\\u05D5\\u05E9|\\u05D5\\u05DB|\\u05D5\\u05D4|\\u05DB\\u05E9";
const PLACEHOLDER = new RegExp(`((?<![\\u05D0-\\u05EA])(?:${PREFIX_RUN})(?![\\u05D0-\\u05EA]))?\\{(\\w+)\\}`, "g");

export function format(template: string, params?: FormatParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (match, prefix: string | undefined, key: string) => {
    const raw = params[key];
    if (raw === undefined) return match;
    const value = String(raw);
    return `${prefix ?? ""}${hyphenFor(prefix, value)}${value}`;
  });
}
