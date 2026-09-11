import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency.js";

describe("mapWithConcurrency", () => {
  it("preserves input order while bounding active operations", async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, value === 1 ? 8 : 1));
      active -= 1;
      return value * 2;
    });

    expect(result).toEqual([2, 4, 6, 8]);
    expect(peak).toBe(2);
  });

  it("returns an empty result without invoking the operation", async () => {
    let calls = 0;
    await expect(mapWithConcurrency([], 3, async () => {
      calls += 1;
      return "unreachable";
    })).resolves.toEqual([]);
    expect(calls).toBe(0);
  });
});
