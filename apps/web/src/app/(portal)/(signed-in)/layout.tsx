import { isFlagOn } from '@slotwise/shared';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageShell } from '@/components/page-shell';
import { getMe } from '@/lib/me';

/**
 * Student and teacher pages: a light, phone-first frame (no admin navigation), server
 * rendered with no client JavaScript so it stays quick on slow connections.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  if (!isFlagOn('P5')) notFound();
  const me = await getMe('/today');
  return (
    <PageShell instituteName={me.institute.name} email={me.user.email}>
      {children}
    </PageShell>
  );
}
