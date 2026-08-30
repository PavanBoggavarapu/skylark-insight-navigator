/**
 * Deterministic date-range resolution.
 *
 * Gemini may *name* a period ("last quarter"); it never performs the
 * arithmetic. All boundaries are computed here, server-side, in UTC.
 */

export type TimeRangeType =
  | "all_time"
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "next_quarter"
  | "this_year"
  | "last_year"
  | "quarter"
  | "custom";

export interface TimeRangeSpec {
  type: TimeRangeType;
  quarter?: 1 | 2 | 3 | 4 | null | undefined;
  year?: number | null | undefined;
  from?: string | null | undefined; // ISO yyyy-mm-dd
  to?: string | null | undefined; // ISO yyyy-mm-dd
}

export interface ResolvedRange {
  from: string | null; // inclusive ISO date, null = unbounded
  to: string | null; // inclusive ISO date, null = unbounded
  label: string;
}

function d(y: number, m: number, day: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function endOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function quarterRange(year: number, q: number): ResolvedRange {
  const startMonth = (q - 1) * 3 + 1;
  const endMonthNum = startMonth + 2;
  return {
    from: d(year, startMonth, 1),
    to: d(year, endMonthNum, endOfMonth(year, endMonthNum)),
    label: `Q${q} ${year}`,
  };
}

export function resolveTimeRange(spec: TimeRangeSpec | null | undefined, now = new Date()): ResolvedRange {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const currentQ = Math.floor((m - 1) / 3) + 1;

  switch (spec?.type) {
    case "today":
      return { from: d(y, m, day), to: d(y, m, day), label: "Today" };
    case "this_week": {
      const dow = now.getUTCDay(); // 0 = Sunday
      const offsetToMonday = (dow + 6) % 7;
      const start = new Date(Date.UTC(y, m - 1, day - offsetToMonday));
      const end = new Date(Date.UTC(y, m - 1, day - offsetToMonday + 6));
      return {
        from: start.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
        label: "This week",
      };
    }
    case "this_month":
      return { from: d(y, m, 1), to: d(y, m, endOfMonth(y, m)), label: "This month" };
    case "last_month": {
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12 : m - 1;
      return { from: d(ly, lm, 1), to: d(ly, lm, endOfMonth(ly, lm)), label: "Last month" };
    }
    case "this_quarter":
      return { ...quarterRange(y, currentQ), label: `This quarter (Q${currentQ} ${y})` };
    case "last_quarter": {
      const q = currentQ === 1 ? 4 : currentQ - 1;
      const yr = currentQ === 1 ? y - 1 : y;
      return { ...quarterRange(yr, q), label: `Last quarter (Q${q} ${yr})` };
    }
    case "next_quarter": {
      const q = currentQ === 4 ? 1 : currentQ + 1;
      const yr = currentQ === 4 ? y + 1 : y;
      return { ...quarterRange(yr, q), label: `Next quarter (Q${q} ${yr})` };
    }
    case "this_year":
      return { from: d(y, 1, 1), to: d(y, 12, 31), label: `${y}` };
    case "last_year":
      return { from: d(y - 1, 1, 1), to: d(y - 1, 12, 31), label: `${y - 1}` };
    case "quarter": {
      const q = spec.quarter ?? currentQ;
      return quarterRange(spec.year ?? y, q);
    }
    case "custom": {
      const from = spec.from ?? null;
      const to = spec.to ?? null;
      const label =
        from && to ? `${from} to ${to}` : from ? `From ${from}` : to ? `Until ${to}` : "All time";
      return { from, to, label };
    }
    default:
      return { from: null, to: null, label: "All time" };
  }
}

/** Inclusive ISO-date comparison. Records with a null date are never matched. */
export function isWithin(dateIso: string | null, range: ResolvedRange): boolean {
  if (!dateIso) return false;
  if (range.from && dateIso < range.from) return false;
  if (range.to && dateIso > range.to) return false;
  return true;
}

export function isUnbounded(range: ResolvedRange): boolean {
  return range.from === null && range.to === null;
}
