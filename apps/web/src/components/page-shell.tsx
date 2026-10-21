import { Button } from '@slotwise/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOutAction } from '@/app/actions';

/** Phone-first page frame: institute name, who is signed in, sign out. */
export async function PageShell({
  instituteName,
  email,
  children,
}: {
  instituteName?: string;
  email?: string | null;
  children: ReactNode;
}) {
  const t = await getTranslations('common');
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <Link href="/" className="min-w-0 rounded-md text-base font-semibold focus-visible:ring-2">
          <span className="block truncate">{instituteName ?? t('appName')}</span>
        </Link>
        {email ? (
          <form action={signOutAction} className="flex items-center gap-2">
            <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">
              {t('signedInAs', { email })}
            </span>
            <Button type="submit" variant="ghost" size="sm">
              {t('signOut')}
            </Button>
          </form>
        ) : null}
      </header>
      <main id="main" className="flex flex-1 flex-col gap-4 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
