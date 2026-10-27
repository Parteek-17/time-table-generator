import { isFlagOn } from '@slotwise/shared';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '@/auth';

/**
 * Platform admin screens, on the bare domain. Who may see them is the API's call
 * (PlatformAdminGuard → can()); pages show "platform admins only" on a 403.
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  if (!isFlagOn('P7')) notFound();
  const session = await auth();
  if (!session?.user) redirect('/sign-in');
  return children;
}
