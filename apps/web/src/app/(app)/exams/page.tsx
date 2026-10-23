import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Exams' };

/** Placeholder from C0; P6 replaces it. */
export default function ExamsPage() {
  return <ComingSoon flag="P6" namespace="p6.placeholder" />;
}
