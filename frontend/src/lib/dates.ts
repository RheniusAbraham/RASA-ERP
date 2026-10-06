/**
 * The backend sends calendar dates as "YYYY-MM-DD". `new Date("2026-05-01")` would read that as
 * midnight UTC, which shows as the previous day in timezones behind UTC. These helpers read it as
 * a local date instead, so a date always displays as the day it was entered.
 */

export function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** e.g. "01 May 2026" */
export function formatDate(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Whole days from today until the date (negative once it has passed, 0 on the day itself). */
export function daysUntil(iso: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseLocalDate(iso).getTime() - today.getTime()) / 86_400_000);
}
