import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './cn';

const alertVariants = cva('rounded-lg border p-4 text-sm', {
  variants: {
    variant: {
      default: 'bg-background',
      success: 'border-success/40 bg-success/10',
      destructive: 'border-destructive/50 bg-destructive/10',
    },
  },
  defaultVariants: { variant: 'default' },
});

/** Announced by screen readers. Pair the colour with words; never colour alone. */
export function Alert({
  className,
  variant,
  role = 'status',
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div role={role} className={cn(alertVariants({ variant }), className)} {...props} />;
}
