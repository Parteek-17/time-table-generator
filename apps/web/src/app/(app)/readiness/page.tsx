import type { TimetableScopeRow } from '@slotwise/shared';
import { buttonVariants } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { TermPicker } from '@/components/term-picker';
import { getMe, list } from '@/lib/me';
import { pickTerm } from '@/lib/terms';
import { ReadinessSection } from './section';

export const metadata: Metadata = { title: 'Ready to generate?' };

export default async function ReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string; scope?: string }>;
}) {
  const me = await getMe('/readiness');
  const t = await getTranslations('p1.readiness');
  const params = await searchParams;
  const { terms, term } = await pickTerm(params.term);
  if (!me.may('readiness.view')) return <Problem title={t('title')} />;
  if (!term) {
    return (
      <>
        <PageHeader title={t('title')} />
        <Problem title={t('noTermTitle')} body={t('noTermBody')}>
          <Link href="/terms" className={buttonVariants()}>
            {t('fix.terms')}
          </Link>
        </Problem>
      </>
    );
  }
  const scopes = await list<TimetableScopeRow>(`/timetable-scopes?termId=${term.id}`);
  const scope = scopes.find((s) => s.id === params.scope) ?? null;
  return (
    <>
      <PageHeader
        title={t('title')}
        description={
          scope
            ? t('scopeSubtitle', { scope: scope.name, term: term.label })
            : t('subtitle', { term: term.label })
        }
      >
        <TermPicker terms={terms} current={term.id} />
      </PageHeader>
      {scopes.length > 0 ? (
        <nav aria-label={t('title')} className="flex flex-wrap gap-2">
          {[{ id: null, name: t('wholeTerm') }, ...scopes].map((s) => {
            const current = (scope?.id ?? null) === s.id;
            return (
              <Link
                key={s.id ?? 'all'}
                href={`/readiness?term=${term.id}${s.id ? `&scope=${s.id}` : ''}`}
                aria-current={current ? 'page' : undefined}
                className={buttonVariants({ size: 'sm', variant: current ? 'default' : 'outline' })}
              >
                {s.name}
              </Link>
            );
          })}
        </nav>
      ) : null}
      <ReadinessSection termId={term.id} scopeId={scope?.id} />
    </>
  );
}
