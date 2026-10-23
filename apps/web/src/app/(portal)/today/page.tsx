import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = { title: 'Today' };

/** Placeholder from C0; P5 replaces it (and adds the (portal) layout). */
export default function TodayPage() {
  return (
    <PageShell>
      <ComingSoon flag="P5" namespace="p5.placeholder" />
    </PageShell>
  );
}
