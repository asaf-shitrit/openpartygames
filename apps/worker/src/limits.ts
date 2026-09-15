// Optional rate-limit bindings. The generated Env only has CREATE_LIMITER /
// JOIN_LIMITER when wrangler.jsonc declares them, so the router looks them up
// by name and allows the request when the binding is absent (local dev, older
// configs).

export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type LimiterName = "CREATE_LIMITER" | "JOIN_LIMITER";

/** The bindings the router may find on the Worker env. Both are optional. */
export type LimiterBindings = Partial<Record<LimiterName, Limiter>>;

/** Returns the binding when present, else undefined. */
export function getLimiter(
  bindings: LimiterBindings,
  name: LimiterName,
): Limiter | undefined {
  return bindings[name];
}

/** True when the request may proceed: no limiter, or the limiter allows the key. */
export async function allowed(
  limiter: Limiter | undefined,
  key: string,
): Promise<boolean> {
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key })).success;
  } catch {
    // A broken limiter must not take the whole game night down.
    return true;
  }
}