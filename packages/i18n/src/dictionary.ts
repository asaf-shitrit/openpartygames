import { en } from "./en";

/** The dictionary shape. `he` (and any future locale) must implement it exactly:
 * a missing key is a compile error, an extra key is a compile error. */
export type Dictionary = typeof en;

export { en };
