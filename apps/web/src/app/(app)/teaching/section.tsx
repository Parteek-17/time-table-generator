import type { TeachingCohortDto, TermRow } from '@slotwise/shared';
import { Badge, buttonVariants, cn } from '@slotwise/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { list } from '@/lib/me';

/**
 * The term's running cohorts, each with how many classes still need a teacher and a link
 * to its grid. Used by /teaching and wizard step 11.
 */
export async function TeachingSection({ term }: { term: TermRow }) {
  const t = await getTranslations('p1.teaching');
  const cohorts = await list<TeachingCohortDto>(`/teaching?termId=${term.id}`);
  if (cohorts.length === 0) return <p className="text-muted-foreground">{t('noCohorts')}</p>;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="teaching-cohorts">
      <h2 id="teaching-cohorts" className="text-lg font-semibold">
        {t('cohortsHeading')}
      </h2>
      <ul className="flex flex-col divide-y rounded-xl border">
        {cohorts.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.displayCode}</p>
              <p className="text-sm text-muted-foreground">
                {c.joinsDisplayCode
                  ? t('joins', { code: c.joinsDisplayCode })
                  : t('cohortLine', { semester: c.semester, sections: c.sections })}
              </p>
            </div>
            {c.joinsDisplayCode ? null : c.cells > 0 && c.missing === 0 ? (
              <Badge className="border-success/40 bg-success/10">{t('allSet')}</Badge>
            ) : c.missing > 0 ? (
              <Badge className="border-destructive/50 bg-destructive/10">
                {t('missing', { count: c.missing })}
              </Badge>
            ) : null}
            <Link
              href={`/teaching/${c.id}`}
              aria-label={t('openFor', { code: c.displayCode })}
              className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
            >
              {t('open')}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Links to the other screens a coordinator visits before generating. */
export async function BeforeGenerating({ termId }: { termId: string }) {
  const [t, tNav] = await Promise.all([getTranslations('p1.teaching'), getTranslations('nav')]);
  const links = [
    {
      href: `/teaching/fixed-slots?term=${termId}`,
      label: tNav('fixedSlots'),
      hint: t('fixedSlotsHint'),
    },
    { href: `/teaching/scope?term=${termId}`, label: tNav('timetableScope'), hint: t('scopeHint') },
    { href: `/readiness?term=${termId}`, label: tNav('readiness'), hint: t('readinessHint') },
  ];
  return (
    <section className="flex flex-col gap-2" aria-labelledby="before-generating">
      <h2 id="before-generating" className="text-lg font-semibold">
        {t('moreHeading')}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="flex min-h-11 flex-col rounded-xl border p-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="font-medium text-primary">{l.label}</span>
              <span className="text-sm text-muted-foreground">{l.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
