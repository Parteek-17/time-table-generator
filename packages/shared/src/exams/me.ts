/** "My exams": a student's seats and a teacher's invigilation duties, from published plans. */

export interface MySeatDto {
  date: string;
  sessionLabel: string;
  startMinute: number;
  endMinute: number;
  paperCode: string;
  paperTitle: string;
  hallCode: string;
  /** Building name, or null if the room is gone. */
  building: string | null;
  /** 0 = ground floor; null if the room is gone. */
  floor: number | null;
  /** e.g. "G16-R3-C2". */
  seatLabel: string;
  row: number;
  column: number;
}

export interface MyDutyDto {
  date: string;
  sessionLabel: string;
  startMinute: number;
  endMinute: number;
  hallCode: string;
  building: string | null;
  floor: number | null;
}

export interface MyExamsDto {
  /**
   * What to show: seats for a student (found by sign-in email), duties for a teacher (found by
   * linked login), null when the sign-in is linked to neither.
   */
  shows: 'seats' | 'duties' | null;
  name: string | null;
  /** Students only. */
  rollNo: string | null;
  /** Today and later, soonest first. */
  seats: MySeatDto[];
  duties: MyDutyDto[];
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** "Ground floor", "1st floor", "2nd floor" … */
export function floorName(floor: number): string {
  if (floor === 0) return 'Ground floor';
  const tens = floor % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[floor % 10] ?? 'th');
  return `${floor}${suffix} floor`;
}
