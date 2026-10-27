import { describe, expect, it } from 'vitest';
import { SegmentedControl, segmentedKeyTarget } from './segmented';
import { count, render } from './test/render';

describe('segmentedKeyTarget', () => {
  const none = [false, false, false, false];

  it('moves with arrows and wraps', () => {
    expect(segmentedKeyTarget(0, 'ArrowRight', none)).toBe(1);
    expect(segmentedKeyTarget(3, 'ArrowRight', none)).toBe(0);
    expect(segmentedKeyTarget(0, 'ArrowLeft', none)).toBe(3);
    expect(segmentedKeyTarget(2, 'ArrowUp', none)).toBe(1);
    expect(segmentedKeyTarget(2, 'ArrowDown', none)).toBe(3);
  });

  it('skips disabled buttons', () => {
    const d = [false, true, true, false];
    expect(segmentedKeyTarget(0, 'ArrowRight', d)).toBe(3);
    expect(segmentedKeyTarget(3, 'ArrowRight', d)).toBe(0);
    const ends = [true, false, false, true];
    expect(segmentedKeyTarget(1, 'Home', ends)).toBeNull();
    expect(segmentedKeyTarget(2, 'End', ends)).toBeNull();
    expect(segmentedKeyTarget(2, 'Home', ends)).toBe(1);
    expect(segmentedKeyTarget(1, 'End', ends)).toBe(2);
  });

  it('ignores other keys and lone buttons', () => {
    expect(segmentedKeyTarget(0, 'Enter', none)).toBeNull();
    expect(segmentedKeyTarget(0, 'ArrowRight', [false])).toBeNull();
    expect(segmentedKeyTarget(0, 'ArrowRight', [false, true])).toBeNull();
  });
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'section', label: 'Section' },
    { value: 'faculty', label: 'Teacher' },
    { value: 'room', label: 'Room', disabled: true },
  ];

  it('is a labelled group of toggle buttons with one pressed', () => {
    const html = render(
      <SegmentedControl label="Show" options={options} value="faculty" onChange={() => {}} />,
    );
    expect(html).toContain('role="group" aria-label="Show"');
    expect(count(html, 'type="button"')).toBe(3);
    expect(count(html, 'aria-pressed="true"')).toBe(1);
    // Chosen is bold as well as filled: not colour alone.
    expect(html).toMatch(/aria-pressed="true"[^>]*font-semibold[^>]*>Teacher</);
    expect(html).toMatch(/aria-pressed="false" disabled=""[^>]*>Room</);
  });

  it('gives short labels a full name and large tap targets on request', () => {
    const html = render(
      <SegmentedControl
        label="Day"
        size="lg"
        options={[{ value: 1, label: 'Mon', ariaLabel: 'Monday, today' }]}
        value={1}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Monday, today"');
    expect(html).toContain('h-11');
  });
});
