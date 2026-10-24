import { cn } from '@slotwise/ui';

/**
 * Progress bar. Local until the UI stream ships one in @slotwise/ui
 * (docs/coordination/requests/2026-10-24-p1-ui-progress-and-skeleton.md).
 */
export function ProgressBar({
  value,
  label,
  className,
}: {
  /** 0..100 */
  value: number;
  /** Read by screen readers, e.g. "Setup 40% done". */
  label: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** Grey placeholder block while a step loads. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-lg bg-muted', className)} />;
}
