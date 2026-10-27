/** Small display helpers for the rescheduling screens (no React, no I/O). */

/** 600 → "10:00". */
export function clock(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "10:00" → 600; null for anything else. */
export function minuteOf(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute <= 1440 ? minute : null;
}

/** A `YYYY-MM-DD` date as a Date at noon UTC, so formatting never slips a day. */
export function day(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** "P3", or "P5–P6" for a lab block. */
export function periods(start: number, length: number): string {
  return length > 1 ? `P${start}–P${start + length - 1}` : `P${start}`;
}
