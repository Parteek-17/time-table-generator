import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = { title: 'Platform' };

/** Placeholder from C0; P7 replaces it (and adds the (platform) layout and access checks). */
export default function PlatformPage() {
  return (
    <PageShell>
      <ComingSoon flag="P7" namespace="p7.platform" />
    </PageShell>
  );
}
