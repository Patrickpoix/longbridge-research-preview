export function parseIsoTime(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** 省略 referenceTime 时只在研究/归一化边界显式取当前时刻；无效输入必须失败。 */
export function resolveReferenceTime(referenceTime?: string): string {
  if (referenceTime === undefined) return new Date().toISOString();
  const parsed = new Date(referenceTime);
  if (Number.isNaN(parsed.getTime())) throw new RangeError("referenceTime must be a valid instant");
  return parsed.toISOString();
}

/** 多命令聚合只使用所有已成功响应中的最后读取时刻，避免数组顺序伪造 aggregate provenance。 */
export function aggregateRetrievedAt(values: readonly (string | undefined)[], fallback: string): string {
  let latest = fallback;
  for (const value of values) {
    const parsed = parseIsoTime(value);
    if (parsed !== null && parsed > latest) latest = parsed;
  }
  return latest;
}

/** 叶子事实存在时只在叶子之间取最新时刻；fallback 仅用于完全没有可解析叶子的结果。 */
export function aggregateObservedRetrievedAt(values: readonly (string | undefined)[], fallback: string): string {
  const observed = values.map(parseIsoTime).filter((value): value is string => value !== null);
  return observed.length === 0 ? fallback : aggregateRetrievedAt(observed, observed[0] as string);
}
