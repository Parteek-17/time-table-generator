import { Button } from '@slotwise/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOutAction } from '@/app/actions';
import { api } from '@/lib/api';
import type { Me } from '@/lib/me';
import { navFor } from '@/registry/nav';
import { AppNav, MobileMenu } from './app-nav';
import { ChatWidget } from './assistant/chat-widget';

/** Signed-in frame: header, role-aware navigation, main content. Phone first. */
export async function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const [t, tNav] = await Promise.all([getTranslations('common'), getTranslations('nav')]);
  const groups = await navFor(me);
  // "Ask Slotwise" shows only when the API has an assistant key.
  const assistant = await api<{ enabled: boolean }>('/assistant');
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="relative border-b">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link
            href="/"
            className="min-w-0 rounded-md text-base font-semibold focus-visible:ring-2"
          >
            <span className="block truncate">{me.institute.name}</span>
          </Link>
          <div className="flex items-center gap-2">
            <MobileMenu groups={groups} label={tNav('menu')} />
            <form action={signOutAction} className="flex items-center gap-2">
              <span className="hidden max-w-48 truncate text-sm text-muted-foreground md:inline">
                {t('signedInAs', { email: me.user.email })}
              </span>
              <Button type="submit" variant="ghost" size="sm">
                {t('signOut')}
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <aside className="hidden w-60 shrink-0 border-r p-3 lg:block" aria-label={tNav('label')}>
          <AppNav groups={groups} />
        </aside>
        <main id="main" className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
      {assistant.ok && assistant.data.enabled ? (
        <ChatWidget canEdit={me.may('timetable.edit')} />
      ) : null}
    </div>
  );
}

/** Page title with an optional line of help and actions on the right. */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}
