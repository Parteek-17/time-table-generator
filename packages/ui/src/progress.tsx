import type { ReactNode } from 'react';
import { cn } from './cn';

/** Whole percent between 0 and 100; NaN counts as 0. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return value === Infinity ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * How far something has got, 0..100. The bar is never the only signal: screen readers get
 * `label` and the value, and `status` (e.g. "Placing classes… 40%") is a visible line that is
 * announced when it changes.
 */
export function ProgressBar({
  value,
  label,
  status,
  minVisible = 0,
  className,
}: {
  /** 0..100 */
  value: number;
  /** Read by screen readers, e.g. "Setup 40% done". */
  label: string;
  /** Text under the bar, announced politely when it changes. */
  status?: ReactNode;
  /** Draw at least this much so a just-started job shows a sliver (the value stays exact). */
  minVisible?: number;
  className?: string;
}) {
  const percent = clampPercent(value);
  const bar = (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%`}
      className={cn(
        'h-2 w-full overflow-hidden rounded-full bg-muted forced-colors:border',
        status === undefined && className,
      )}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none forced-colors:bg-[Highlight]"
        style={{ width: `${Math.max(percent, clampPercent(minVisible))}%` }}
      />
    </div>
  );
  if (status === undefined) return bar;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {bar}
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {status}
      </p>
    </div>
  );
}
