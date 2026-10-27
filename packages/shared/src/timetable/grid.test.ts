import { describe, expect, it } from 'vitest';
import { dayCells, gridColumns, type GridBell } from './grid';

const bell: GridBell = {
  workingDays: [1, 2, 3, 4, 5],
  periods: [1, 2, 3, 4, 5, 6].map((index) => ({
    index,
    label: `P${index}`,
    startMinute: 480 + index * 50,
    endMinute: 530 + index * 50,
  })),
  breaks: [
    { label: 'Tea', afterPeriodIndex: 2, minutes: 10 },
    { label: 'Lunch', afterPeriodIndex: 4, minutes: 40 },
    { label: 'After school', afterPeriodIndex: 6, minutes: 0 },
  ],
};

const slot = (name: string, weekday: number, startPeriodIndex: number, length = 1) => ({
  name,
  weekday,
  startPeriodIndex,
  length,
});

const shape = (cells: ReturnType<typeof dayCells<ReturnType<typeof slot>>>) =>
  cells.map((c) =>
    c.kind === 'classes'
      ? `${c.slots.map((s) => s.name).join('+')}:${c.columns}`
      : c.kind === 'free'
        ? '-'
        : `|${c.label}`,
  );

describe('gridColumns', () => {
  it('puts breaks after their period and drops one after the last period', () => {
    expect(gridColumns(bell).map((c) => (c.kind === 'period' ? c.label : c.label))).toEqual([
      'P1',
      'P2',
      'Tea',
      'P3',
      'P4',
      'Lunch',
      'P5',
      'P6',
    ]);
  });
});

describe('dayCells', () => {
  it('draws free periods, single classes and breaks', () => {
    expect(shape(dayCells([slot('DS', 1, 2)], 1, bell))).toEqual([
      '-',
      'DS:1',
      '|Tea',
      '-',
      '-',
      '|Lunch',
      '-',
      '-',
    ]);
  });

  it('spans a lab block over its periods, and over a short break inside it', () => {
    expect(shape(dayCells([slot('LAB', 1, 5, 2)], 1, bell)).slice(-2)).toEqual(['|Lunch', 'LAB:2']);
    expect(shape(dayCells([slot('LAB', 1, 2, 2)], 1, bell)).slice(0, 3)).toEqual([
      '-',
      'LAB:3',
      '-',
    ]);
  });

  it('keeps a break that comes right after a class', () => {
    expect(shape(dayCells([slot('X', 1, 1, 2)], 1, bell)).slice(0, 2)).toEqual(['X:2', '|Tea']);
  });

  it('puts overlapping classes of sub-groups in one cell', () => {
    const cells = dayCells(
      [slot('G1 lab', 2, 5, 2), slot('G2 tut', 2, 5), slot('G2 x', 2, 6)],
      2,
      bell,
    );
    expect(shape(cells).slice(-1)).toEqual(['G1 lab+G2 tut+G2 x:2']);
  });

  it('joins chains of overlaps into one cell', () => {
    const cells = dayCells([slot('A', 3, 3, 2), slot('B', 3, 4, 2)], 3, bell);
    // A is P3–P4, B is P4–P5: one cell over P3, P4, lunch and P5; P6 stays free.
    expect(shape(cells)).toEqual(['-', '-', '|Tea', 'A+B:4', '-']);
  });

  it('ignores other days', () => {
    expect(shape(dayCells([slot('DS', 2, 1)], 1, bell))[0]).toBe('-');
  });
});
