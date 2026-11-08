import type { Ratio } from "~/services/analyticsService";

// ─── Analytics Display Conventions ───
// Small samples mislead as percentages, so a ratio whose denominator is under
// SMALL_SAMPLE renders as the raw fraction ("2/3"). An empty ratio or a missing
// mean renders as an em dash.

export const SMALL_SAMPLE = 5;

const EMPTY = "—";

/** A share (0–1) as a whole percentage. */
export function formatPercent(share: number | null): string {
  return share === null ? EMPTY : `${Math.round(share * 100)}%`;
}

/** A ratio as a percentage, or as a raw fraction when the sample is small. */
export function formatRatio(ratio: Ratio): string {
  if (ratio.total === 0) return EMPTY;
  if (ratio.total < SMALL_SAMPLE) return `${ratio.count}/${ratio.total}`;
  return formatPercent(ratio.count / ratio.total);
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** A mean to one decimal place ("1.5"), or an em dash when there is none. */
export function formatAverage(value: number | null): string {
  return value === null ? EMPTY : value.toFixed(1);
}
