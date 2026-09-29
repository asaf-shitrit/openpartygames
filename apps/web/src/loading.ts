/**
 * Marks anything still waiting on a lazily loaded chunk: a game's screens, or the QR code.
 * The layout gallery holds its ready mark until no element carries it, so the suite never
 * measures a placeholder and calls it a screen.
 */
export const LOADING_ATTRIBUTE = "data-loading";
