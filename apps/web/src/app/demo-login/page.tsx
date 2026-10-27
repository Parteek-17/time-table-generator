import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { getInstituteSlug } from '@/lib/api';
import { DEMO_ACCOUNTS, demoLoginsEnabled } from '@/lib/demo-logins';
import { env } from '@/lib/env';
import { demoSignIn } from './actions';

export const metadata: Metadata = { title: 'Demo accounts' };

export default async function DemoLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ missing?: string }>;
}) {
  if (!demoLoginsEnabled()) notFound();
  const t = await getTranslations('demoLogin');
  const { missing } = await searchParams;
  // Platform pages live on the main domain and institute pages on the institute's subdomain;
  // a sign-in cookie belongs to one host, so each account signs in where its pages are.
  const slug = await getInstituteSlug();
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const port = host.includes(':') ? `:${host.split(':')[1]}` : '';
  const root = env().WEB_ROOT_DOMAIN;
  const elsewhere = (platform: boolean) =>
    platform === Boolean(slug)
      ? `${proto}://${platform ? '' : 'demo.'}${root}${port}/demo-login`
      : null;
  return (
    <PageShell>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>
      {missing ? (
        <Alert variant="destructive" role="alert">
          {t('missing')}
        </Alert>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {DEMO_ACCOUNTS.filter(
          // One institute on a plain address has no separate main site for platform pages.
          (a) => !(a.role === 'platform' && process.env.SINGLE_INSTITUTE_SLUG),
        ).map((a) => (
          <li key={a.email}>
            <Card>
              <CardHeader>
                <CardTitle>{t(`roles.${a.role}.name`)}</CardTitle>
                <CardDescription>{t(`roles.${a.role}.sees`)}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="break-all text-sm text-muted-foreground">{a.email}</p>
                {elsewhere(a.role === 'platform') ? (
                  <a
                    href={elsewhere(a.role === 'platform')!}
                    className="text-sm text-primary underline underline-offset-4"
                  >
                    {t(a.role === 'platform' ? 'onMainSite' : 'onDemoInstitute')}
                  </a>
                ) : (
                  <form action={demoSignIn}>
                    <input type="hidden" name="email" value={a.email} />
                    <Button type="submit" className="w-full">
                      {t('signInAs', { role: t(`roles.${a.role}.name`) })}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
