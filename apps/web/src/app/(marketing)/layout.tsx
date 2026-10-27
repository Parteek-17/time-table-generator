import { isFlagOn } from '@slotwise/shared';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

/** Public pages on the bare domain (slotwise.app): no sign-in, no institute. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  if (!isFlagOn('P7')) notFound();
  return children;
}
