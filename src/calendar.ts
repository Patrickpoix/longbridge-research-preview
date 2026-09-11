export type Market = "CN" | "HK" | "US";
export type MarketTimezone = "Asia/Shanghai" | "Asia/Hong_Kong" | "America/New_York";
export type DateInput = Date | string | number;

export const MARKET_TIMEZONES: Readonly<Record<Market, MarketTimezone>> = {
  CN: "Asia/Shanghai",
  HK: "Asia/Hong_Kong",
  US: "America/New_York",
};

export type LocalClock = `${string}:${string}`;

// 交易所连续休市通常不会跨越整月；超过该界限说明日历覆盖不足，应 fail-closed 而不是无限搜索。
const MAX_TRADING_DAY_SEARCH_DAYS = 31;

export interface MarketSchedule {
  readonly market: Market;
  readonly timezone: MarketTimezone;
  readonly open: LocalClock;
  readonly close: LocalClock;
}

/**
 * 这里只描述股票常规连续交易时段；节假日和临时停牌需要由上层注入正式交易所日历。
 */
export const MARKET_SCHEDULES: Readonly<Record<Market, MarketSchedule>> = {
  CN: { market: "CN", timezone: "Asia/Shanghai", open: "09:30", close: "15:00" },
  HK: { market: "HK", timezone: "Asia/Hong_Kong", open: "09:30", close: "16:00" },
  US: { market: "US", timezone: "America/New_York", open: "09:30", close: "16:00" },
};

export type MarketCalendarSource = string;
export type MarketCalendarConfidence = "authoritative" | "provisional";

/**
 * 交易所适配器只负责声明某个市场日期是否交易以及当日时段覆盖。
 * 未命中时返回 null，由默认周末回退继续提供明确的 provisional 结果。
 */
export interface MarketCalendarDayOverride {
  readonly isTradingDay: boolean;
  readonly reason: string;
  readonly source: MarketCalendarSource;
  readonly confidence: MarketCalendarConfidence;
  readonly open?: LocalClock;
  readonly close?: LocalClock;
}

export interface MarketCalendarAdapter {
  getDayStatus(market: Market, date: string): MarketCalendarDayOverride | null;
}

/** 没有正式交易所日历时的显式 fallback；它不会冒充权威日历。 */
export const weekendFallbackCalendar: MarketCalendarAdapter = {
  getDayStatus: () => null,
};

export interface MarketDayStatus {
  readonly market: Market;
  readonly timezone: MarketTimezone;
  readonly date: string;
  readonly weekday: number;
  readonly isTradingDay: boolean;
  readonly status: "trading" | "closed";
  readonly provisional: boolean;
  readonly confidence: MarketCalendarConfidence;
  readonly source: MarketCalendarSource;
  readonly reason: string;
}

export interface MarketSessionDateResolution {
  readonly market: Market;
  readonly timezone: MarketTimezone;
  readonly instant: string;
  readonly localDate: string;
  readonly sessionDate: string;
  readonly localWeekday: number;
  readonly isTradingDay: boolean;
  readonly provisional: boolean;
  readonly source: MarketCalendarSource;
}

export interface MarketLocalDateTime {
  readonly date: string;
  readonly time: LocalClock;
  readonly minute: number;
}

export interface MarketSession {
  readonly market: Market;
  readonly timezone: MarketTimezone;
  readonly date: string;
  readonly isTradingDay: boolean;
  readonly provisional: boolean;
  readonly source: MarketCalendarSource;
  readonly openLocal: string;
  readonly closeLocal: string;
  readonly openAt: Date;
  readonly closeAt: Date;
}

export type MarketTradingPhase = "weekend" | "pre-open" | "open" | "post-close";

export interface MarketTradingStatus {
  readonly market: Market;
  readonly timezone: MarketTimezone;
  readonly sessionDate: string;
  readonly localTime: string;
  readonly phase: MarketTradingPhase;
  readonly isOpen: boolean;
  readonly isTradingDay: boolean;
  readonly provisional: boolean;
  readonly source: MarketCalendarSource;
  readonly session: MarketSession | null;
}

export interface MarketPublishWindow {
  readonly market: Market;
  readonly timezone: MarketTimezone;
  readonly sessionDate: string;
  readonly previousSessionDate: string;
  readonly startLocal: string;
  readonly endLocal: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly provisional: boolean;
  readonly source: MarketCalendarSource;
}

export type PublishWindowStatus = "before-window" | "open" | "after-window";

export interface MarketPublishStatus {
  readonly market: Market;
  readonly timezone: MarketTimezone;
  readonly sessionDate: string;
  readonly status: PublishWindowStatus;
  readonly canPublish: boolean;
  readonly provisional: boolean;
  readonly source: MarketCalendarSource;
  readonly window: MarketPublishWindow;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/u;

function assertMarket(value: string): asserts value is Market {
  if (value !== "CN" && value !== "HK" && value !== "US") {
    throw new RangeError(`unsupported market: ${value}`);
  }
}

function parseDateParts(value: string): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new RangeError(`invalid market date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const check = new Date(timestamp);
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
  ) {
    throw new RangeError(`invalid market date: ${value}`);
  }
  return { year, month, day };
}

function parseTimeParts(value: string): { hour: number; minute: number; second: number } {
  const match = TIME_PATTERN.exec(value);
  if (!match) throw new RangeError(`invalid local market time: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) throw new RangeError(`invalid local market time: ${value}`);
  return { hour, minute, second };
}

function validatedCalendarOverride(
  adapter: MarketCalendarAdapter,
  market: Market,
  date: string,
): MarketCalendarDayOverride | null {
  const override = adapter.getDayStatus(market, date);
  if (override === null) return null;
  if (override.source.trim().length === 0 || override.reason.trim().length === 0) {
    throw new RangeError(`calendar adapter must provide source and reason for ${market}:${date}`);
  }
  if (override.open !== undefined) parseTimeParts(override.open);
  if (override.close !== undefined) parseTimeParts(override.close);
  if (override.isTradingDay && (override.open === undefined || override.close === undefined)) {
    throw new RangeError(`calendar adapter must provide open and close for trading day ${market}:${date}`);
  }
  if (override.isTradingDay && override.open !== undefined && override.close !== undefined) {
    const open = parseTimeParts(override.open);
    const close = parseTimeParts(override.close);
    const openSeconds = open.hour * 3600 + open.minute * 60 + open.second;
    const closeSeconds = close.hour * 3600 + close.minute * 60 + close.second;
    if (closeSeconds <= openSeconds) throw new RangeError(`calendar adapter close must be after open for ${market}:${date}`);
  }
  return override;
}

function combinedCalendarSource(left: MarketCalendarSource, right: MarketCalendarSource): MarketCalendarSource {
  return left === right ? left : `${left}+${right}`;
}

function toInstant(value: DateInput): Date {
  const instant = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(instant.getTime())) throw new RangeError("invalid instant");
  return instant;
}

const localFormatters = new Map<MarketTimezone, Intl.DateTimeFormat>();

function formatterFor(timezone: MarketTimezone): Intl.DateTimeFormat {
  const cached = localFormatters.get(timezone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    calendar: "gregory",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    numberingSystem: "latn",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  });
  localFormatters.set(timezone, formatter);
  return formatter;
}

function localPartsAt(instant: Date, timezone: MarketTimezone): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = formatterFor(timezone);
  const values = Object.fromEntries(
    formatter.formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  const value = (name: string): number => {
    const parsed = values[name];
    if (parsed === undefined || !Number.isInteger(parsed)) throw new RangeError(`timezone formatter omitted ${name}`);
    return parsed;
  };
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function formatDateParts(parts: Pick<ReturnType<typeof localPartsAt>, "year" | "month" | "day">): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function formatClock(parts: Pick<ReturnType<typeof localPartsAt>, "hour" | "minute" | "second">): string {
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}`;
}

/** 所有需要按交易所时区拆解瞬间的调用方共用此边界，避免各层自行拼 Intl 格式化。 */
export function marketLocalDateTime(market: Market, instantInput: DateInput): MarketLocalDateTime {
  assertMarket(market);
  const local = localPartsAt(toInstant(instantInput), timezoneForMarket(market));
  return {
    date: formatDateParts(local),
    time: `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`,
    minute: local.hour * 60 + local.minute,
  };
}

export function shiftCalendarDate(date: string, amount: number): string {
  const { year, month, day } = parseDateParts(date);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + amount);
  return formatDateParts({ year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() });
}

/** 返回下一个可验证交易日；日历窗口耗尽时返回 null，让调度器明确阻止执行。 */
export function nextTradingDay(
  market: Market,
  date: string,
  calendar: MarketCalendarAdapter = weekendFallbackCalendar,
): MarketDayStatus | null {
  parseDateParts(date);
  let candidate = shiftCalendarDate(date, 1);
  for (let attempt = 0; attempt < MAX_TRADING_DAY_SEARCH_DAYS; attempt += 1) {
    const day = marketDayStatus(market, candidate, calendar);
    if (day.isTradingDay) return day;
    candidate = shiftCalendarDate(candidate, 1);
  }
  return null;
}

function weekdayForDate(date: string): number {
  const { year, month, day } = parseDateParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function localDateTimeToInstant(date: string, clock: LocalClock, timezone: MarketTimezone): Date {
  const dateParts = parseDateParts(date);
  const timeParts = parseTimeParts(clock);
  const targetAsUtc = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, timeParts.hour, timeParts.minute, timeParts.second);
  let candidate = targetAsUtc;

  // Intl 只提供“瞬间 -> 本地时间”。通过反复修正时区偏移反解本地开收盘时间，能跨过美股 DST 切换。
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = localPartsAt(new Date(candidate), timezone);
    const displayedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const offset = displayedAsUtc - candidate;
    const corrected = targetAsUtc - offset;
    if (corrected === candidate) return new Date(candidate);
    candidate = corrected;
  }

  const finalParts = localPartsAt(new Date(candidate), timezone);
  if (
    finalParts.year !== dateParts.year
    || finalParts.month !== dateParts.month
    || finalParts.day !== dateParts.day
    || finalParts.hour !== timeParts.hour
    || finalParts.minute !== timeParts.minute
    || finalParts.second !== timeParts.second
  ) {
    throw new RangeError(`local market time does not exist: ${date} ${clock} ${timezone}`);
  }
  return new Date(candidate);
}

export function timezoneForMarket(market: Market): MarketTimezone {
  assertMarket(market);
  return MARKET_TIMEZONES[market];
}

export function scheduleForMarket(market: Market): MarketSchedule {
  assertMarket(market);
  return MARKET_SCHEDULES[market];
}

/**
 * 周末判断只是一条无节假日数据的兜底规则。它对工作日也只能给出 provisional，不能充当正式交易所日历。
 */
export function marketDayStatus(
  market: Market,
  date: string,
  calendar: MarketCalendarAdapter = weekendFallbackCalendar,
): MarketDayStatus {
  assertMarket(market);
  parseDateParts(date);
  const weekday = weekdayForDate(date);
  const override = validatedCalendarOverride(calendar, market, date);
  if (override) {
    return {
      market,
      timezone: timezoneForMarket(market),
      date,
      weekday,
      isTradingDay: override.isTradingDay,
      status: override.isTradingDay ? "trading" : "closed",
      provisional: override.confidence === "provisional",
      confidence: override.confidence,
      source: override.source,
      reason: override.reason,
    };
  }
  const isTradingDay = weekday !== 0 && weekday !== 6;
  return {
    market,
    timezone: timezoneForMarket(market),
    date,
    weekday,
    isTradingDay,
    status: isTradingDay ? "trading" : "closed",
    provisional: true,
    confidence: "provisional",
    source: "weekend-fallback",
    reason: isTradingDay ? "holiday calendar was not supplied" : "weekend is treated as closed by fallback",
  };
}

export function isMarketTradingDay(market: Market, date: string, calendar: MarketCalendarAdapter = weekendFallbackCalendar): boolean {
  return marketDayStatus(market, date, calendar).isTradingDay;
}

export function resolveMarketSessionDate(
  market: Market,
  instantInput: DateInput,
  options: { rollWeekendToPrevious?: boolean; calendar?: MarketCalendarAdapter } = {},
): MarketSessionDateResolution {
  assertMarket(market);
  const instant = toInstant(instantInput);
  const local = localPartsAt(instant, timezoneForMarket(market));
  const localDate = formatDateParts(local);
  const calendar = options.calendar ?? weekendFallbackCalendar;
  const day = marketDayStatus(market, localDate, calendar);
  const rollWeekendToPrevious = options.rollWeekendToPrevious ?? true;
  const sessionDate = rollWeekendToPrevious && !day.isTradingDay ? previousTradingDate(market, localDate, calendar) : localDate;
  return {
    market,
    timezone: timezoneForMarket(market),
    instant: instant.toISOString(),
    localDate,
    sessionDate,
    localWeekday: day.weekday,
    isTradingDay: day.isTradingDay,
    provisional: day.provisional,
    source: day.source,
  };
}

export function calculateMarketSessionDate(
  market: Market,
  instantInput: DateInput,
  options: { rollWeekendToPrevious?: boolean; calendar?: MarketCalendarAdapter } = {},
): string {
  return resolveMarketSessionDate(market, instantInput, options).sessionDate;
}

/** 返回给定日期之前最近一个可验证交易日；周末/节假日不会被自然日减法误当成 session。 */
export function previousTradingDay(
  market: Market,
  date: string,
  calendar: MarketCalendarAdapter = weekendFallbackCalendar,
): MarketDayStatus | null {
  let candidate = shiftCalendarDate(date, -1);
  for (let attempt = 0; attempt < MAX_TRADING_DAY_SEARCH_DAYS; attempt += 1) {
    const day = marketDayStatus(market, candidate, calendar);
    if (day.isTradingDay) return day;
    candidate = shiftCalendarDate(candidate, -1);
  }
  return null;
}

function previousTradingDate(market: Market, date: string, calendar: MarketCalendarAdapter): string {
  const previous = previousTradingDay(market, date, calendar);
  if (!previous) throw new RangeError(`could not find previous trading date for ${market}:${date}`);
  return previous.date;
}

export function marketSessionForDate(
  market: Market,
  date: string,
  calendar: MarketCalendarAdapter = weekendFallbackCalendar,
): MarketSession {
  assertMarket(market);
  parseDateParts(date);
  const schedule = scheduleForMarket(market);
  const day = marketDayStatus(market, date, calendar);
  const override = validatedCalendarOverride(calendar, market, date);
  const open = override?.open ?? schedule.open;
  const close = override?.close ?? schedule.close;
  return {
    market,
    timezone: schedule.timezone,
    date,
    isTradingDay: day.isTradingDay,
    provisional: day.provisional,
    source: day.source,
    openLocal: `${date}T${open}:00`,
    closeLocal: `${date}T${close}:00`,
    openAt: localDateTimeToInstant(date, open, schedule.timezone),
    closeAt: localDateTimeToInstant(date, close, schedule.timezone),
  };
}

export function marketTradingStatus(
  market: Market,
  instantInput: DateInput,
  calendar: MarketCalendarAdapter = weekendFallbackCalendar,
): MarketTradingStatus {
  assertMarket(market);
  const instant = toInstant(instantInput);
  const timezone = timezoneForMarket(market);
  const local = localPartsAt(instant, timezone);
  const sessionDate = formatDateParts(local);
  const day = marketDayStatus(market, sessionDate, calendar);
  if (!day.isTradingDay) {
    return {
      market,
      timezone,
      sessionDate,
      localTime: formatClock(local),
      phase: "weekend",
      isOpen: false,
      isTradingDay: false,
      provisional: day.provisional,
      source: day.source,
      session: null,
    };
  }
  const session = marketSessionForDate(market, sessionDate, calendar);
  const timestamp = instant.getTime();
  const phase = timestamp < session.openAt.getTime() ? "pre-open" : timestamp < session.closeAt.getTime() ? "open" : "post-close";
  return {
    market,
    timezone,
    sessionDate,
    localTime: formatClock(local),
    phase,
    isOpen: phase === "open",
    isTradingDay: true,
    provisional: session.provisional,
    source: session.source,
    session,
  };
}

export function marketPublishWindow(
  market: Market,
  sessionDate: string,
  calendar: MarketCalendarAdapter = weekendFallbackCalendar,
): MarketPublishWindow {
  assertMarket(market);
  parseDateParts(sessionDate);
  const day = marketDayStatus(market, sessionDate, calendar);
  if (!day.isTradingDay) {
    throw new RangeError(`cannot build a publish window for a non-trading date: ${market}:${sessionDate}`);
  }
  const session = marketSessionForDate(market, sessionDate, calendar);
  const previousSessionDate = previousTradingDate(market, sessionDate, calendar);
  const previousSession = marketSessionForDate(market, previousSessionDate, calendar);
  return {
    market,
    timezone: session.timezone,
    sessionDate,
    previousSessionDate,
    startLocal: previousSession.closeLocal,
    endLocal: session.openLocal,
    startsAt: previousSession.closeAt,
    endsAt: session.openAt,
    provisional: session.provisional || previousSession.provisional,
    source: combinedCalendarSource(session.source, previousSession.source),
  };
}

export function marketPublishStatus(
  market: Market,
  instantInput: DateInput,
  sessionDate?: string,
  calendar: MarketCalendarAdapter = weekendFallbackCalendar,
): MarketPublishStatus {
  assertMarket(market);
  const instant = toInstant(instantInput);
  const targetDate = sessionDate ?? calculateMarketSessionDate(market, instant, { rollWeekendToPrevious: false, calendar });
  const targetDay = marketDayStatus(market, targetDate, calendar);
  if (!targetDay.isTradingDay) {
    const previousSessionDate = previousTradingDate(market, targetDate, calendar);
    const previousSession = marketSessionForDate(market, previousSessionDate, calendar);
    const closedWindow: MarketPublishWindow = {
      market,
      timezone: previousSession.timezone,
      sessionDate: targetDate,
      previousSessionDate,
      startLocal: previousSession.closeLocal,
      endLocal: previousSession.closeLocal,
      startsAt: previousSession.closeAt,
      endsAt: previousSession.closeAt,
      provisional: targetDay.provisional || previousSession.provisional,
      source: combinedCalendarSource(targetDay.source, previousSession.source),
    };
    return {
      market,
      timezone: previousSession.timezone,
      sessionDate: targetDate,
      status: "after-window",
      canPublish: false,
      provisional: targetDay.provisional || previousSession.provisional,
      source: combinedCalendarSource(targetDay.source, previousSession.source),
      window: closedWindow,
    };
  }
  const window = marketPublishWindow(market, targetDate, calendar);
  const timestamp = instant.getTime();
  const status: PublishWindowStatus = timestamp < window.startsAt.getTime()
    ? "before-window"
    : timestamp < window.endsAt.getTime()
      ? "open"
      : "after-window";
  return {
    market,
    timezone: window.timezone,
    sessionDate: targetDate,
    status,
    canPublish: status === "open",
    provisional: window.provisional,
    source: window.source,
    window,
  };
}

export function isPublishWindowOpen(
  market: Market,
  instantInput: DateInput,
  sessionDate?: string,
  calendar: MarketCalendarAdapter = weekendFallbackCalendar,
): boolean {
  return marketPublishStatus(market, instantInput, sessionDate, calendar).canPublish;
}
