import { describe, expect, it } from 'vitest';
import { clampPercent, ProgressBar } from './progress';
import { Skeleton } from './skeleton';
import { render } from './test/render';

describe('clampPercent', () => {
  it('rounds and clamps to 0..100', () => {
    expect(clampPercent(39.6)).toBe(40);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(250)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(Infinity)).toBe(100);
  });
});

describe('ProgressBar', () => {
  it('is a labelled progressbar with its value', () => {
    const html = render(<ProgressBar value={40} label="Setup 40% done" />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Setup 40% done"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="40"');
    expect(html).toContain('aria-valuetext="40%"');
    expect(html).toContain('width:40%');
    expect(html).not.toContain('aria-live');
  });

  it('draws a sliver at the start but reports the real value', () => {
    const html = render(<ProgressBar value={0} label="Generating" minVisible={3} />);
    expect(html).toContain('aria-valuenow="0"');
    expect(html).toContain('width:3%');
  });

  it('announces the status line politely', () => {
    const html = render(<ProgressBar value={55} label="Generating" status="Placing labs… 55%" />);
    expect(html).toMatch(/<p aria-live="polite"[^>]*>Placing labs… 55%<\/p>/);
  });
});

describe('Skeleton', () => {
  it('is hidden from screen readers and still when motion is reduced', () => {
    const html = render(<Skeleton className="h-8 w-2/3" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('motion-reduce:animate-none');
    expect(html).toContain('h-8 w-2/3');
  });
});
