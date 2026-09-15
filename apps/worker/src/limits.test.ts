import { describe, expect, it } from "vitest";
import { allowed, getLimiter, type Limiter } from "./limits";

describe("getLimiter", () => {
  it("returns the binding when it is present", () => {
    const limiter: Limiter = { limit: async () => ({ success: true }) };
    expect(getLimiter({ CREATE_LIMITER: limiter }, "CREATE_LIMITER")).toBe(
      limiter,
    );
  });

  it("returns undefined when the binding is absent", () => {
    expect(getLimiter({}, "JOIN_LIMITER")).toBeUndefined();
  });
});

describe("allowed", () => {
  it("allows everything when there is no limiter", async () => {
    expect(await allowed(undefined, "1.2.3.4")).toBe(true);
  });

  it("uses the limiter decision and passes the client key", async () => {
    const keys: string[] = [];
    const yes: Limiter = {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: true };
      },
    };
    const no: Limiter = { limit: async () => ({ success: false }) };

    expect(await allowed(yes, "1.2.3.4")).toBe(true);
    expect(await allowed(no, "1.2.3.4")).toBe(false);
    expect(keys).toEqual(["1.2.3.4"]);
  });

  it("fails open when the limiter itself breaks", async () => {
    const bad: Limiter = {
      limit: async () => {
        throw new Error("no namespace");
      },
    };
    expect(await allowed(bad, "1.2.3.4")).toBe(true);
  });
});