import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ComingSoon } from '@/components/coming-soon';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = { title: 'UI gallery' };

/** Design-system gallery, development only. Placeholder from C0; UI replaces it. */
export default function UiGalleryPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <PageShell>
      <ComingSoon flag="UI" namespace="ui.gallery" />
    </PageShell>
  );
}
