import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Changes and make-ups' };

/** Placeholder from C0; P4 replaces it. */
export default function ReschedulePage() {
  return <ComingSoon flag="P4" namespace="p4.placeholder" />;
}
