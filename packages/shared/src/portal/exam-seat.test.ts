import { describe, expect, it } from 'vitest';
import { ExamSeatV1 } from '../contracts';
import { examSeatFrom, floorName, MyExamsAdapter } from './exam-seat';

/** Shaped like P6's GET /exams/me for a student (extra fields are ignored). */
const mine = {
  shows: 'seats',
  name: 'Test Student',
  rollNo: '2315179',
  seats: [
    {
      date: '2026-12-03',
      sessionLabel: 'Morning',
      startMinute: 600,
      endMinute: 780,
      paperCode: 'CS301',
      paperTitle: 'Data Structures',
      hallCode: 'G16',
      building: 'Main block',
      floor: 0,
      seatLabel: 'G16-R3-C2',
      row: 3,
      column: 2,
    },
    {
      date: '2026-12-01',
      sessionLabel: 'Afternoon',
      startMinute: 840,
      endMinute: 1020,
      paperCode: 'CS303',
      paperTitle: 'Operating Systems',
      hallCode: 'S214',
      building: 'Science block',
      floor: 2,
      seatLabel: 'S214-R1-C4',
      row: 1,
      column: 4,
    },
  ],
  duties: [],
};

describe('exam seat on Today', () => {
  it('picks the soonest seat within 14 days, in portal-read.v1 shape', () => {
    const seat = examSeatFrom(MyExamsAdapter.parse(mine), '2026-11-25');
    expect(ExamSeatV1.parse(seat)).toEqual({
      date: '2026-12-01',
      sessionLabel: 'Afternoon',
      reportingMinute: 840,
      paperCode: 'CS303',
      paperTitle: 'Operating Systems',
      hallCode: 'S214',
      building: 'Science block',
      floor: 2,
      seatLabel: 'S214-R1-C4',
    });
  });

  it('shows nothing too far ahead, in the past, or for a hall that is gone', () => {
    const parsed = MyExamsAdapter.parse(mine);
    expect(examSeatFrom(parsed, '2026-11-01')).toBeNull();
    expect(examSeatFrom(parsed, '2026-12-04')).toBeNull();
    const gone = MyExamsAdapter.parse({
      seats: [{ ...mine.seats[1], building: null, floor: null }],
    });
    expect(examSeatFrom(gone, '2026-11-25')).toBeNull();
  });

  it('refuses a changed shape instead of guessing', () => {
    expect(MyExamsAdapter.safeParse({ seats: [{ date: 'soon' }] }).success).toBe(false);
  });

  it('names floors in words', () => {
    expect([0, 1, 2, 3, 4, 11, 21].map(floorName)).toEqual([
      'Ground floor',
      '1st floor',
      '2nd floor',
      '3rd floor',
      '4th floor',
      '11th floor',
      '21st floor',
    ]);
  });
});
