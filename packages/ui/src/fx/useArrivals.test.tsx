import { afterEach, describe, expect, it } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { arrivalsBetween, useArrivals } from "./useArrivals";

afterEach(cleanup);

describe("arrivalsBetween", () => {
  it("returns ids in next that were not in prev, in next's order", () => {
    expect(arrivalsBetween(["a"], ["a", "b", "c"])).toEqual(["b", "c"]);
  });

  it("returns nothing when nothing new arrived", () => {
    expect(arrivalsBetween(["a", "b"], ["a", "b"])).toEqual([]);
  });
});

describe("useArrivals", () => {
  it("reports nothing on mount, even with a non-empty list", () => {
    const { result } = renderHook(() => useArrivals(["a", "b"]));
    expect(result.current).toEqual([]);
  });

  it("reports ids added on a later render", () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: readonly string[] }) => useArrivals(ids),
      { initialProps: { ids: ["a"] } },
    );
    expect(result.current).toEqual([]);
    rerender({ ids: ["a", "b"] });
    expect(result.current).toEqual(["b"]);
  });

  it("reports nothing again once the arrival has been rendered", () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: readonly string[] }) => useArrivals(ids),
      { initialProps: { ids: ["a"] } },
    );
    rerender({ ids: ["a", "b"] });
    expect(result.current).toEqual(["b"]);
    rerender({ ids: ["a", "b"] });
    expect(result.current).toEqual([]);
  });

  it("does not report a reconnect that swaps the whole list", () => {
    const { result } = renderHook(() => useArrivals(["a", "b", "c"]));
    expect(result.current).toEqual([]);
  });
});
