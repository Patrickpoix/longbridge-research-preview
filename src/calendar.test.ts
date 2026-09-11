import { describe, expect, it } from "vitest";
import {
  calculateMarketSessionDate,
  marketDayStatus,
  marketLocalDateTime,
  nextTradingDay,
  marketPublishStatus,
  marketSessionForDate,
  marketTradingStatus,
  timezoneForMarket,
  type MarketCalendarAdapter,
} from "./calendar";

describe("market calendar and timezone helpers", () => {
  it("maps each supported market to its exchange timezone", () => {
    expect(timezoneForMarket("CN")).toBe("Asia/Shanghai");
    expect(timezoneForMarket("HK")).toBe("Asia/Hong_Kong");
    expect(timezoneForMarket("US")).toBe("America/New_York");
  });

  it("resolves local date and clock through the market timezone", () => {
    expect(marketLocalDateTime("US", new Date("2026-03-09T12:00:00.000Z"))).toEqual({
      date: "2026-03-09",
      time: "08:00",
      minute: 480,
    });
  });

  it("keeps the weekend fallback explicitly provisional", () => {
    const saturday = marketDayStatus("CN", "2026-08-08");
    const friday = marketDayStatus("CN", "2026-08-07");

    expect(saturday).toMatchObject({
      isTradingDay: false,
      status: "closed",
      provisional: true,
      confidence: "provisional",
      source: "weekend-fallback",
    });
    expect(friday).toMatchObject({ isTradingDay: true, provisional: true });
  });

  it("derives session dates from the market-local calendar date", () => {
    expect(calculateMarketSessionDate("CN", "2026-08-05T23:59:00.000Z")).toBe("2026-08-06");
    expect(calculateMarketSessionDate("US", "2026-08-06T01:00:00.000Z")).toBe("2026-08-05");
    expect(calculateMarketSessionDate("CN", "2026-08-08T12:00:00.000Z")).toBe("2026-08-07");
  });

  it("finds the next session through the calendar owner", () => {
    const exchangeCalendar: MarketCalendarAdapter = {
      getDayStatus: (market, date) => market === "CN" && date === "2026-08-10"
        ? { isTradingDay: false, reason: "exchange holiday", source: "test-calendar", confidence: "authoritative" }
        : null,
    };
    expect(nextTradingDay("CN", "2026-08-07", exchangeCalendar)).toMatchObject({ date: "2026-08-11", provisional: true, source: "weekend-fallback" });
  });

  it("uses the DST-aware New York offset for session boundaries", () => {
    const winter = marketSessionForDate("US", "2026-01-12");
    const summer = marketSessionForDate("US", "2026-07-13");

    expect(winter.openAt.toISOString()).toBe("2026-01-12T14:30:00.000Z");
    expect(winter.closeAt.toISOString()).toBe("2026-01-12T21:00:00.000Z");
    expect(summer.openAt.toISOString()).toBe("2026-07-13T13:30:00.000Z");
    expect(summer.closeAt.toISOString()).toBe("2026-07-13T20:00:00.000Z");
  });

  it("reports open and closed phases in New York local time across DST", () => {
    const beforeOpen = marketTradingStatus("US", "2026-03-09T13:29:59.000Z");
    const open = marketTradingStatus("US", "2026-03-09T13:30:00.000Z");
    const afterClose = marketTradingStatus("US", "2026-03-09T20:00:00.000Z");

    expect(beforeOpen).toMatchObject({ sessionDate: "2026-03-09", phase: "pre-open", isOpen: false });
    expect(open).toMatchObject({ sessionDate: "2026-03-09", phase: "open", isOpen: true });
    expect(afterClose).toMatchObject({ sessionDate: "2026-03-09", phase: "post-close", isOpen: false });
  });

  it("allows publishing after the previous close and before the target open", () => {
    const eligible = marketPublishStatus("US", "2026-03-09T13:00:00.000Z", "2026-03-09");
    const closed = marketPublishStatus("US", "2026-03-09T14:00:00.000Z", "2026-03-09");

    expect(eligible).toMatchObject({ sessionDate: "2026-03-09", status: "open", canPublish: true, provisional: true });
    expect(eligible.window.previousSessionDate).toBe("2026-03-06");
    expect(closed).toMatchObject({ status: "after-window", canPublish: false });
  });

  it("fails closed for a weekend publish target", () => {
    const status = marketPublishStatus("CN", "2026-08-08T01:00:00.000Z", "2026-08-08");
    const inferredStatus = marketPublishStatus("US", "2026-08-08T12:00:00.000Z");
    expect(status).toMatchObject({ sessionDate: "2026-08-08", status: "after-window", canPublish: false, provisional: true });
    expect(inferredStatus).toMatchObject({ sessionDate: "2026-08-08", status: "after-window", canPublish: false, provisional: true });
  });

  it("accepts an authoritative holiday and half-day adapter without changing the fallback", () => {
    const exchangeCalendar: MarketCalendarAdapter = {
      getDayStatus: (market, date) => {
        if (market === "US" && date === "2026-07-03") {
          return { isTradingDay: false, reason: "Independence Day observed", source: "test-exchange-calendar", confidence: "authoritative" };
        }
        if (market === "US" && date === "2026-11-27") {
          return { isTradingDay: true, open: "09:30", close: "13:00", reason: "Thanksgiving half-day", source: "test-exchange-calendar", confidence: "authoritative" };
        }
        if (market === "US" && (date === "2026-07-02" || date === "2026-07-06")) {
          return { isTradingDay: true, open: "09:30", close: "16:00", reason: "regular session", source: "test-exchange-calendar", confidence: "authoritative" };
        }
        return null;
      },
    };

    expect(marketDayStatus("US", "2026-07-03", exchangeCalendar)).toMatchObject({
      isTradingDay: false,
      provisional: false,
      confidence: "authoritative",
      source: "test-exchange-calendar",
    });
    const halfDay = marketSessionForDate("US", "2026-11-27", exchangeCalendar);
    expect(halfDay.provisional).toBe(false);
    expect(halfDay.closeAt.toISOString()).toBe("2026-11-27T18:00:00.000Z");
    expect(marketTradingStatus("US", "2026-11-27T18:00:00.000Z", exchangeCalendar)).toMatchObject({ phase: "post-close", isOpen: false, provisional: false });
    expect(marketPublishStatus("US", "2026-07-06T13:00:00.000Z", "2026-07-06", exchangeCalendar)).toMatchObject({ provisional: false, source: "test-exchange-calendar" });
    expect(marketPublishStatus("US", "2026-07-06T13:00:00.000Z", "2026-07-06", exchangeCalendar).window.previousSessionDate).toBe("2026-07-02");
  });
});
