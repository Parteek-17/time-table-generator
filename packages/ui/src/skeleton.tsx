import type { ComponentProps } from 'react';
import { cn } from './cn';

/**
 * Grey placeholder in the shape of what is loading, for `loading.tsx`. Hidden from screen
 * readers: put `aria-busy="true"` (and a heading) on the region that is loading instead.
 */
export function Skeleton({ className, ...props }: Omit<ComponentProps<'div'>, 'children'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-lg bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  );
}
