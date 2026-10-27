'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

export interface SegmentedOption<V extends string | number> {
  value: V;
  label: ReactNode;
  /** Full name for screen readers when `label` is short ("Mon" → "Monday, today"). */
  ariaLabel?: string;
  disabled?: boolean;
  /** Extra classes for this button, e.g. a ring on today's day. */
  className?: string;
}

/**
 * Where arrow keys, Home and End move focus from `from`, skipping disabled buttons and
 * wrapping around. Null for other keys or when nothing else can take focus.
 */
export function segmentedKeyTarget(
  from: number,
  key: string,
  disabled: readonly boolean[],
): number | null {
  const n = disabled.length;
  const enabled = (i: number) => !disabled[i];
  const step = (dir: 1 | -1) => {
    for (let k = 1; k <= n; k++) {
      const i = (((from + dir * k) % n) + n) % n;
      if (enabled(i)) return i === from ? null : i;
    }
    return null;
  };
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return step(1);
    case 'ArrowLeft':
    case 'ArrowUp':
      return step(-1);
    case 'Home': {
      const i = disabled.findIndex((d) => !d);
      return i === -1 || i === from ? null : i;
    }
    case 'End': {
      const i = disabled.findLastIndex((d) => !d);
      return i === -1 || i === from ? null : i;
    }
    default:
      return null;
  }
}

/**
 * Pick one of a few options: a labelled group of toggle buttons (`aria-pressed`). Every button
 * is a normal tab stop; arrow keys, Home and End also move between them. The chosen one is
 * filled and bold, so it never relies on colour alone. Wraps on narrow screens.
 */
export function SegmentedControl<V extends string | number>({
  label,
  options,
  value,
  onChange,
  size = 'default',
  className,
}: {
  /** Names the group for screen readers, e.g. "Show timetable for". */
  label: string;
  options: readonly SegmentedOption<V>[];
  value: V | null;
  onChange: (value: V) => void;
  /** `lg` is 44px tall, for day pickers people tap on phones. */
  size?: 'default' | 'lg';
  className?: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const target = segmentedKeyTarget(
      index,
      event.key,
      options.map((o) => Boolean(o.disabled)),
    );
    if (target === null) return;
    event.preventDefault();
    buttons.current[target]?.focus();
  };

  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex flex-wrap gap-1 rounded-lg border bg-background p-1', className)}
    >
      {options.map((option, index) => {
        const pressed = option.value === value;
        return (
          <button
            key={String(option.value)}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            aria-pressed={pressed}
            aria-label={option.ariaLabel}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={onKeyDown(index)}
            className={cn(
              'min-w-fit flex-1 rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
              size === 'lg' ? 'h-11' : 'h-9',
              pressed
                ? 'bg-primary font-semibold text-primary-foreground shadow-sm forced-colors:outline forced-colors:outline-2'
                : 'font-medium hover:bg-muted',
              option.className,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
