/**
 * The week grid of a timetable view: columns (periods and breaks from the bell schedule) and,
 * per day, the cells to draw. Lab blocks span their periods; classes that overlap in time (a
 * section's sub-groups in two labs at once) share one cell. Pure, for the web and tests.
 */

export interface GridPeriod {
  index: number;
  label: string;
  startMinute: number;
  endMinute: number;
}

export interface GridBreak {
  label: string;
  afterPeriodIndex: number;
  minutes: number;
}

/** The parts of a bell schedule the grid needs. */
export interface GridBell {
  workingDays: number[];
  periods: GridPeriod[];
  breaks: GridBreak[];
}

export type GridColumn = ({ kind: 'period' } & GridPeriod) | ({ kind: 'break' } & GridBreak);

/** Periods in order, with each break after the period it follows. */
export function gridColumns(bell: GridBell): GridColumn[] {
  const periods = [...bell.periods].sort((a, b) => a.index - b.index);
  const out: GridColumn[] = [];
  for (const p of periods) {
    out.push({ kind: 'period', ...p });
    for (const b of bell.breaks.filter((x) => x.afterPeriodIndex === p.index)) {
      // A break after the last period is not a gap in the day.
      if (p !== periods[periods.length - 1]) out.push({ kind: 'break', ...b });
    }
  }
  return out;
}

interface Placed {
  weekday: number;
  startPeriodIndex: number;
  length: number;
}

export type GridCell<S> =
  /** Classes from `startPeriod` to `endPeriod`; `columns` counts breaks inside the span. */
  | { kind: 'classes'; startPeriod: number; endPeriod: number; columns: number; slots: S[] }
  | { kind: 'free'; period: number }
  | ({ kind: 'break' } & GridBreak);

const end = (s: Placed) => s.startPeriodIndex + s.length - 1;

/** The cells of one day, left to right, matching gridColumns(). */
export function dayCells<S extends Placed>(
  slots: readonly S[],
  weekday: number,
  bell: GridBell,
): GridCell<S>[] {
  const columns = gridColumns(bell);
  const today = slots
    .filter((s) => s.weekday === weekday)
    .sort((a, b) => a.startPeriodIndex - b.startPeriodIndex || b.length - a.length);
  const cells: GridCell<S>[] = [];
  let i = 0;
  while (i < columns.length) {
    const col = columns[i]!;
    if (col.kind === 'break') {
      const { kind: _kind, ...rest } = col;
      cells.push({ kind: 'break', ...rest });
      i++;
      continue;
    }
    const covering = today.filter((s) => s.startPeriodIndex <= col.index && end(s) >= col.index);
    if (covering.length === 0) {
      cells.push({ kind: 'free', period: col.index });
      i++;
      continue;
    }
    // Grow the span until no class in it reaches past its end.
    let last = Math.max(...covering.map(end));
    let group = today.filter((s) => s.startPeriodIndex <= last && end(s) >= col.index);
    for (
      let grown = Math.max(...group.map(end));
      grown > last;
      grown = Math.max(...group.map(end))
    ) {
      last = grown;
      group = today.filter((s) => s.startPeriodIndex <= last && end(s) >= col.index);
    }
    let span = 0;
    while (i < columns.length) {
      const c = columns[i]!;
      if (c.kind === 'period' ? c.index > last : c.afterPeriodIndex >= last) break;
      span++;
      i++;
    }
    cells.push({
      kind: 'classes',
      startPeriod: col.index,
      endPeriod: last,
      columns: span,
      slots: group,
    });
  }
  return cells;
}
