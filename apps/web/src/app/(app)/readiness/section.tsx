import {
  READINESS_CATEGORIES,
  type FixScreen,
  type ReadinessDto,
  type ReadinessIssue,
} from '@slotwise/shared';
import { Alert, Badge, buttonVariants, cn } from '@slotwise/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';

/**
 * The page that fixes an issue (readiness() names the screen, the web owns the routes).
 * A map rather than a switch: one screen is called "faculty", which the lint rule against
 * inline role checks would (wrongly) flag.
 */
const FIX_ROUTES: Record<FixScreen, (id?: string) => string> = {
  terms: (id) => (id ? `/terms/${id}` : '/terms'),
  'bell-schedules': (id) => (id ? `/bell-schedules/${id}` : '/bell-schedules'),
  cohort: (id) => (id ? `/cohorts/${id}` : '/cohorts'),
  teaching: (id) => (id ? `/teaching/${id}` : '/teaching'),
  faculty: (id) => (id ? `/faculty/${id}` : '/faculty'),
  rooms: () => '/rooms',
  calendar: (id) => (id ? `/calendar?term=${id}` : '/calendar'),
  scheme: () => '/schemes',
};

export function fixHref(fix: { screen: FixScreen; id?: string }): string {
  return FIX_ROUTES[fix.screen](fix.id);
}

/**
 * "Ready to generate?": the seven check groups, each problem in plain words with a button
 * that opens the screen fixing it (CLAUDE.md "Explain problems and offer fixes"). Used by
 * /readiness and wizard step 12.
 */
export async function ReadinessSection({ termId, scopeId }: { termId: string; scopeId?: string }) {
  const t = await getTranslations('p1.readiness');
  const query = scopeId ? `?scopeId=${encodeURIComponent(scopeId)}` : '';
  const res = await api<ReadinessDto>(`/terms/${termId}/readiness${query}`);
  if (!res.ok) return <Problem title={t('title')} body={res.message} />;
  const r = res.data;
  const byCategory = new Map<string, ReadinessIssue[]>();
  for (const issue of r.issues) {
    byCategory.set(issue.category, [...(byCategory.get(issue.category) ?? []), issue]);
  }
  const over = r.facultyLoad.filter((f) => f.status === 'over');

  return (
    <div className="flex flex-col gap-6">
      <Alert variant={r.ready ? 'success' : 'destructive'} className="flex flex-col gap-1">
        <p className="text-base font-semibold">
          {r.ready ? t('ready') : t('notReady', { count: r.errorCount })}
        </p>
        <p>{r.ready ? t('readyBody') : t('notReadyBody')}</p>
        {r.warningCount > 0 ? <p>{t('warnings', { count: r.warningCount })}</p> : null}
        {r.ready ? (
          <Link href="/timetable" className={cn(buttonVariants({ size: 'sm' }), 'mt-2 self-start')}>
            {t('generate')}
          </Link>
        ) : null}
      </Alert>

      <ol className="flex flex-col gap-3">
        {READINESS_CATEGORIES.map((category, i) => {
          const issues = byCategory.get(category) ?? [];
          const { errors, warnings } = r.byCategory[category];
          const headingId = `readiness-${category}`;
          return (
            <li key={category} className="rounded-xl border p-3">
              <section aria-labelledby={headingId} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id={headingId} className="font-semibold">
                    <span className="text-muted-foreground">{i + 1}. </span>
                    {t(`category.${category}`)}
                  </h2>
                  {errors > 0 ? (
                    <Badge className="border-destructive/50 bg-destructive/10">
                      {t('groupErrors', { count: errors })}
                    </Badge>
                  ) : warnings > 0 ? (
                    <Badge>{t('groupWarnings', { count: warnings })}</Badge>
                  ) : (
                    <Badge className="border-success/40 bg-success/10">✓ {t('groupOk')}</Badge>
                  )}
                </div>
                {issues.length > 0 ? (
                  <ul className="flex flex-col divide-y">
                    {issues.map((issue, j) => (
                      <li
                        key={`${issue.code}-${j}`}
                        className="flex flex-wrap items-center gap-3 py-2"
                      >
                        <p className="min-w-0 flex-1">
                          <span className="font-medium">
                            {issue.severity === 'error' ? t('error') : t('warning')}:
                          </span>{' '}
                          {issue.message}
                        </p>
                        <Link
                          href={fixHref(issue.fix)}
                          className={buttonVariants({
                            size: 'sm',
                            variant: issue.severity === 'error' ? 'default' : 'outline',
                          })}
                        >
                          {t(`fix.${issue.fix.screen}`)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            </li>
          );
        })}
      </ol>

      {r.facultyLoad.length > 0 ? (
        <section aria-labelledby="readiness-load" className="flex flex-col gap-2">
          <h2 id="readiness-load" className="text-lg font-semibold">
            {t('loadHeading')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('loadHint')}</p>
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center text-primary underline">
              {t('showLoad')}
            </summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {[...over, ...r.facultyLoad.filter((f) => f.status !== 'over')].map((f) => (
                <li
                  key={f.facultyId}
                  className="flex justify-between gap-2 rounded-md border px-2 py-1 text-sm"
                >
                  <span>
                    {f.name} ({f.shortCode})
                  </span>
                  <span className={cn(f.status === 'over' && 'font-semibold text-destructive')}>
                    {f.assigned}/{f.max}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}

      {r.teachingDays.length > 0 ? (
        <section aria-labelledby="readiness-days" className="flex flex-col gap-2">
          <h2 id="readiness-days" className="text-lg font-semibold">
            {t('daysHeading')}
          </h2>
          <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {r.teachingDays.map((d) => (
              <li
                key={d.cohortId}
                className="flex justify-between gap-2 rounded-md border px-2 py-1 text-sm"
              >
                <span>{d.displayCode}</span>
                <span className={cn(d.teachingDays < d.minimum && 'font-semibold')}>
                  {t('daysLine', { days: d.teachingDays, minimum: d.minimum })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
