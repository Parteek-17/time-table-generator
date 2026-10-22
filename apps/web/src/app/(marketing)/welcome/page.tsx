import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = { title: 'Welcome' };

/**
 * Placeholder from C0; P7 replaces it. Lives at /welcome because "/" is still the Phase 0
 * home page (apps/web/src/app/page.tsx, INT); moving the root to marketing is an INT request.
 */
export default function WelcomePage() {
  return (
    <PageShell>
      <ComingSoon flag="P7" namespace="p7.marketing" />
    </PageShell>
  );
}
