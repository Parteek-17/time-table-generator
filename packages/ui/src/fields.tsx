import type { ComponentProps } from 'react';
import { cn } from './cn';

const fieldClass =
  'flex h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive disabled:cursor-not-allowed disabled:opacity-50';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input className={cn(fieldClass, 'placeholder:text-muted-foreground', className)} {...props} />
  );
}

/** A styled native select: works best on phones and with screen readers. */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(fieldClass, className)} {...props} />;
}

/** Callers must pass htmlFor (or wrap the control). */
export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium leading-none', className)} {...props} />;
}

/** Plain-language error under a field. Link it with aria-describedby. */
export function FieldError({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-destructive', className)} {...props} />;
}
