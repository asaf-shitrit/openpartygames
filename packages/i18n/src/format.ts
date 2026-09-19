// Tiny `{name}` interpolation. No ICU, no plural syntax embedded in strings —
// pluralization is handled separately by pickPlural so each form stays a
// plain, readable string in the dictionary.

export type FormatParams = Record<string, string | number>;

export function format(template: string, params?: FormatParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}
