import { describe, expect, it } from "vitest";
import { aggregateObservedRetrievedAt, aggregateRetrievedAt, parseIsoTime, resolveReferenceTime } from "./time.js";

describe("shared time", () => {
  it("uses the latest successful response time rather than array order", () => {
    expect(aggregateRetrievedAt(["2026-08-10T00:00:00.000Z", "2026-08-10T00:00:05.000Z", undefined], "2026-08-09T00:00:00.000Z"))
      .toBe("2026-08-10T00:00:05.000Z");
  });

  it("keeps invalid values unavailable and rejects invalid explicit reference time", () => {
    expect(parseIsoTime("not-a-time")).toBeNull();
    expect(() => resolveReferenceTime("not-a-time")).toThrow(RangeError);
  });

  it("uses completion fallback only when no leaf retrieval survives", () => {
    expect(aggregateObservedRetrievedAt(["2026-08-10T00:00:00.000Z"], "2026-08-19T00:00:00.000Z")).toBe("2026-08-10T00:00:00.000Z");
    expect(aggregateObservedRetrievedAt([undefined, "not-a-time"], "2026-08-19T00:00:00.000Z")).toBe("2026-08-19T00:00:00.000Z");
  });
});
