import type { PlatformInstituteDto } from '@slotwise/shared/platform';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { auth } from '@/auth';
import { PageShell } from '@/components/page-shell';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { PlanForm } from './plan-form';

export const metadata: Metadata = { title: 'Platform' };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Every institute on Slotwise, newest first, with its plan. Platform admins only. */
export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [t, session, { q = '' }] = await Promise.all([
    getTranslations('p7.platform'),
    auth(),
    searchParams,
  ]);
  const res = await api<PlatformInstituteDto[]>(
    `/platform/institutes${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  );
  const email = session?.user?.email;

  if (!res.ok) {
    return (
      <PageShell email={email}>
        {res.status === 403 ? (
          <Problem title={t('noAccessTitle')} body={t('noAccessBody')} />
        ) : (
          <Alert variant="destructive">{res.message}</Alert>
        )}
      </PageShell>
    );
  }

  return (
    <PageShell email={email}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('institutes')}</h1>
        <Button asChild>
          <Link href="/platform/institutes/new">{t('newInstitute')}</Link>
        </Button>
      </div>

      <form role="search" className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="q">{t('search')}</Label>
          <Input id="q" name="q" type="search" defaultValue={q} />
        </div>
        <Button type="submit" variant="outline">
          {t('searchButton')}
        </Button>
      </form>

      {res.data.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {res.data.map((inst) => (
            <li key={inst.id}>
              <Card>
                <CardHeader className="gap-1">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <a href={inst.url} className="underline-offset-4 hover:underline">
                      {inst.name}
                    </a>
                    {inst.isSample ? <Badge>{t('sample')}</Badge> : null}
                  </CardTitle>
                  <p className="break-all text-sm text-muted-foreground">
                    {inst.slug} · {t('created', { date: formatDate(inst.createdAt) })}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <p className="text-sm">
                    {inst.plan
                      ? [
                          inst.plan.name,
                          inst.plan.trialEndsOn
                            ? t('trialEnds', { date: formatDate(inst.plan.trialEndsOn) })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : t('noPlan')}
                  </p>
                  <PlanForm
                    instituteId={inst.id}
                    instituteName={inst.name}
                    current={inst.plan?.code ?? null}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
