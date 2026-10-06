export type BillingPeriod = {
  /** e.g. "1st month" or "20 days" */
  label: string;
  /** First and last day of the period, ISO (YYYY-MM-DD), both inclusive */
  from: string;
  to: string;
  /** Calendar days actually billed in this period */
  days: number;
  cost: number;
};

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Adds calendar months, clamping to the last day (31 Jan + 1 month = 28/29 Feb). */
function addMonths(d: Date, n: number) {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay));
}

export function ordinal(n: number) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/**
 * Splits the estimated cost across the contract period.
 *
 * The daily rate is the estimated cost spread over a 30-day-month basis
 * (months × 30 + extra days). Each full month is then charged for the real number
 * of days in that contract month (28–31), and the leftover days are charged as-is.
 *
 * e.g. ₹36,000 for 1 month 20 days → rate ₹720/day (36,000 ÷ 50):
 * a 30-day first month = ₹21,600, a 31-day first month = ₹22,320, and the
 * remaining 20 days = ₹14,400.
 */
export function computeBreakdown(input: {
  startDate: string;
  months: number;
  days: number;
  estimatedCost: number;
}): { dailyRate: number; basisDays: number; periods: BillingPeriod[] } | null {
  const { startDate, months, days, estimatedCost } = input;
  const basisDays = months * 30 + days;
  if (!startDate || basisDays <= 0 || !Number.isFinite(estimatedCost) || estimatedCost < 0) return null;

  const dailyRate = estimatedCost / basisDays;
  const start = fromISO(startDate);
  const periods: BillingPeriod[] = [];

  for (let i = 0; i < months; i++) {
    const from = addMonths(start, i);
    const nextStart = addMonths(start, i + 1);
    const billed = dayDiff(from, nextStart);
    periods.push({
      label: `${ordinal(i + 1)} month`,
      from: toISO(from),
      to: toISO(addDays(nextStart, -1)),
      days: billed,
      cost: round2(dailyRate * billed),
    });
  }

  if (days > 0) {
    const from = addMonths(start, months);
    periods.push({
      label: months === 0 ? `${days} day${days === 1 ? "" : "s"}` : `${ordinal(months + 1)} month`,
      from: toISO(from),
      to: toISO(addDays(from, days - 1)),
      days,
      cost: round2(dailyRate * days),
    });
  }

  return { dailyRate: round2(dailyRate), basisDays, periods };
}
