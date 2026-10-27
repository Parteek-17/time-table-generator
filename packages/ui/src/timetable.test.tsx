import { describe, expect, it } from 'vitest';
import { SlotCard, slotPeriods } from './slot-card';
import { count, render } from './test/render';
import { bell, slot } from './test/week';
import { TimetableGrid } from './timetable-grid';

describe('slotPeriods', () => {
  it('names one period or a block', () => {
    expect(slotPeriods({ startPeriodIndex: 3, length: 1 })).toBe('P3');
    expect(slotPeriods({ startPeriodIndex: 3, length: 2 })).toBe('P3–P4');
  });
});

describe('SlotCard', () => {
  it('reads as one sentence', () => {
    const html = render(<SlotCard slot={slot()} kind="section" whoName="CSE 5A" />);
    expect(html).toContain('role="group"');
    expect(html).toContain(
      'aria-label="CS301 Data Structures, lecture. AV · G16. Monday P1, 09:00 to 09:50."',
    );
  });

  it('writes Lab and Locked on the card, not only colour', () => {
    const lab = slot({
      component: 'practical',
      startPeriodIndex: 3,
      length: 2,
      startMinute: 650,
      endMinute: 750,
      locked: true,
      room: null,
      target: { kind: 'subgroup', id: 'g1', name: 'CSE 5A-G1' },
    });
    const html = render(<SlotCard slot={lab} kind="section" whoName="CSE 5A" />);
    expect(html).toContain('>Lab</span>');
    expect(html).toContain('>Locked</span>');
    expect(html).toContain(
      'CS301 Data Structures, lab. CSE 5A-G1 · AV · no room yet. Monday P3–P4, 10:50 to 12:30. Locked.',
    );
  });

  it('shows the audience and room on a teacher’s week', () => {
    const html = render(<SlotCard slot={slot()} kind="faculty" whoName="Asha Verma (AV)" />);
    expect(html).toContain('>CSE 5A · G16</span>');
  });

  it('renders actions under the card', () => {
    const html = render(
      <SlotCard
        slot={slot()}
        kind="section"
        whoName="CSE 5A"
        actions={<button type="button">Move</button>}
      />,
    );
    expect(html).toContain('<button type="button">Move</button>');
  });
});

describe('TimetableGrid', () => {
  const week = [
    slot({ weekday: 1, startPeriodIndex: 1 }),
    // A lab across the short break, and the other group's lab at the same time.
    slot({
      weekday: 2,
      startPeriodIndex: 2,
      length: 2,
      component: 'practical',
      target: { kind: 'subgroup', id: 'g1', name: 'CSE 5A-G1' },
    }),
    slot({
      weekday: 2,
      startPeriodIndex: 2,
      length: 2,
      component: 'practical',
      target: { kind: 'subgroup', id: 'g2', name: 'CSE 5A-G2' },
    }),
  ];
  const html = render(<TimetableGrid bell={bell} slots={week} kind="section" whoName="CSE 5A" />);

  it('is a captioned table that scrolls inside its own box', () => {
    expect(html).toContain('<caption class="sr-only">Week timetable for CSE 5A</caption>');
    expect(html).toMatch(/role="region" aria-label="Week timetable for CSE 5A" tabindex="0"/);
    expect(html).toContain('relative overflow-x-auto');
    expect(count(html, 'scope="row"')).toBe(3);
  });

  it('heads periods with times and names the inner break once', () => {
    expect(html).toContain('09:00–09:50');
    expect(html).toContain('Short break, 10 minutes');
    // Lunch after the last period is not a gap in the day.
    expect(html).not.toContain('Lunch');
    expect(count(html, '>Short break</span>')).toBe(1);
  });

  it('spans a lab over its periods and the break, both groups in one cell', () => {
    expect(html).toContain('colSpan="3"');
    expect(count(html, '>Lab</span>')).toBe(2);
  });

  it('labels free periods for screen readers', () => {
    // Mon: P2–P4 free, Tue: P1 and P4, Wed: all four.
    expect(count(html, '>Free period</span>')).toBe(9);
  });

  it('abbreviates days with their full name', () => {
    expect(html).toContain('<abbr title="Tuesday" class="no-underline">Tue</abbr>');
  });
});
