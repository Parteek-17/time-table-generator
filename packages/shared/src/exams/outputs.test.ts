import { describe, expect, it } from 'vitest';
import {
  attendanceSheets,
  compareRoll,
  dutyChart,
  hallCharts,
  noticeList,
  type PlanOutputData,
} from './outputs';

const seat = (
  rollNo: string,
  paperCode: string,
  hallCode: string,
  row: number,
  column: number,
  sectionName = 'CS A',
) => ({
  rollNo,
  name: `Student ${rollNo}`,
  sectionName,
  paperCode,
  hallId: `h-${hallCode}`,
  hallCode,
  row,
  column,
  label: `${hallCode}-R${row}-C${column}`,
});

const data: PlanOutputData = {
  examName: 'End-semester exams',
  date: '2026-12-01',
  sessionLabel: 'Morning',
  startMinute: 600,
  endMinute: 780,
  halls: [
    { id: 'h-G1', code: 'G1', rows: 2, columns: 2 },
    { id: 'h-G2', code: 'G2', rows: 1, columns: 2 },
    { id: 'h-G3', code: 'G3', rows: 1, columns: 2 },
  ],
  seats: [
    seat('CS10', 'CS301', 'G1', 1, 1),
    seat('EC1', 'EC301', 'G1', 1, 2, 'EC A'),
    seat('EC2', 'EC301', 'G1', 2, 1, 'EC A'),
    seat('CS9', 'CS301', 'G1', 2, 2),
    seat('CS11', 'CS301', 'G2', 1, 1),
  ],
  duties: [
    { facultyName: 'Ms. Bedi', hallId: 'h-G1', hallCode: 'G1' },
    { facultyName: 'Mr. Chopra', hallId: 'h-G1', hallCode: 'G1' },
  ],
};

describe('seating printouts', () => {
  it('orders roll numbers as numbers', () => {
    expect(['CS10', 'CS9', 'CS11'].sort(compareRoll)).toEqual(['CS9', 'CS10', 'CS11']);
  });

  it('draws one chart per used hall, front row first', () => {
    const charts = hallCharts(data);
    expect(charts.map((c) => c.title)).toEqual([
      'Hall G1 — seating chart',
      'Hall G2 — seating chart',
    ]);
    expect(charts[0]!.header).toEqual(['', 'Seat 1', 'Seat 2']);
    expect(charts[0]!.rows).toEqual([
      ['Row 1', 'CS10\nCS301', 'EC1\nEC301'],
      ['Row 2', 'EC2\nEC301', 'CS9\nCS301'],
    ]);
    expect(charts[0]!.subtitle).toBe(
      'End-semester exams · Tue 1 Dec 2026, Morning (10:00–13:00) · Front of the hall at the top · Invigilators: Ms. Bedi, Mr. Chopra',
    );
    expect(charts[1]!.subtitle).toMatch(/Invigilators: —$/);
  });

  it('lists roll-number ranges per paper, section and hall', () => {
    expect(noticeList(data).rows).toEqual([
      ['CS301', 'CS A', 'CS9 to CS10', '2', 'G1'],
      ['CS301', 'CS A', 'CS11', '1', 'G2'],
      ['EC301', 'EC A', 'EC1 to EC2', '2', 'G1'],
    ]);
  });

  it('makes attendance sheets in roll-number order with room to sign', () => {
    const [g1] = attendanceSheets(data);
    expect(g1!.rows.map((r) => r[1])).toEqual(['CS9', 'CS10', 'EC1', 'EC2']);
    expect(g1!.rows[0]).toEqual(['1', 'CS9', 'Student CS9', 'CS301', 'G1-R2-C2', '', '']);
  });

  it('shows halls without invigilators on the duty chart', () => {
    expect(dutyChart(data).rows).toEqual([
      ['G1', 'Ms. Bedi, Mr. Chopra', 'CS301, EC301', '4'],
      ['G2', '— none —', 'CS301', '1'],
    ]);
  });
});
