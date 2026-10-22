import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { getMe } from '@/lib/me';

/** Signed-in institute pages: one /me lookup per request, shared by every page via cache(). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  return <AppShell me={me}>{children}</AppShell>;
}
