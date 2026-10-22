import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Timetables' };

/** Placeholder from C0; P2T replaces it. */
export default function TimetablePage() {
  return <ComingSoon flag="P2T" namespace="p2t.placeholder" />;
}
