import { isFlagOn } from '@slotwise/shared';
import type {
  CancellationDto,
  DisruptionDto,
  RescheduleChoicesDto,
} from '@slotwise/shared/reschedule';
import { buttonVariants } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { getMe, list } from '@/lib/me';
import { pickTerm } from '@/lib/terms';
import { CancelledList } from './cancelled-list';
import { DisruptionForm } from './disruption-form';
import { DisruptionList } from './disruption-list';
import { UrlSelect } from './url-select';

export const metadata: Metadata = { title: 'Changes and make-ups' };

/**
 * Holidays, events and leave that cancel classes, and the cancelled classes from today on with
 * their make-ups. Editors add (with Undo) and book make-ups; everyone else reads.
 */
export default async function ReschedulePage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  if (!isFlagOn('P4')) notFound();
  const me = await getMe('/reschedule');
  if (!me.may('timetable.view')) notFound();
  const [t, params] = await Promise.all([getTranslations('p4'), searchParams]);
  const canEdit = me.may('timetable.edit');
  const { terms, term } = await pickTerm(params.term);

  const header = (
    <PageHeader title={t('page.title')} description={t('page.description')}>
      {term ? (
        <Link
          href={`/reschedule/coverage?term=${term.id}`}
          className={buttonVariants({ variant: 'outline' })}
        >
          {t('page.coverageLink')}
        </Link>
      ) : null}
    </PageHeader>
  );
  if (!term) {
    return (
      <>
        {header}
        <Problem title={t('page.noTermTitle')} body={t('page.noTermBody')} />
      </>
    );
  }

  const [disruptions, choices, departments] = await Promise.all([
    api<DisruptionDto[]>(`/terms/${term.id}/disruptions`),
    canEdit ? api<RescheduleChoicesDto>(`/terms/${term.id}/reschedule/choices`) : null,
    list<{ id: string; name: string }>('/departments'),
  ]);
  const today = choices?.ok ? choices.data.today : new Date().toISOString().slice(0, 10);
  const cancelled = await api<CancellationDto[]>(`/terms/${term.id}/cancellations?from=${today}`);
  if (!disruptions.ok || !cancelled.ok) {
    const message = !disruptions.ok ? disruptions.message : !cancelled.ok ? cancelled.message : '';
    return (
      <>
        {header}
        <Problem title={t('page.errorTitle')} body={message} />
      </>
    );
  }

  const departmentNames = Object.fromEntries(departments.map((d) => [d.id, d.name]));
  const names: Record<string, string> = { ...departmentNames };
  if (choices?.ok) {
    for (const s of choices.data.sections) names[s.id] = s.name;
    for (const f of choices.data.faculty) names[f.id] = f.name;
  }

  return (
    <>
      {header}
      <UrlSelect
        param="term"
        label={t('page.term')}
        value={term.id}
        options={terms.map((x) => ({ value: x.id, label: x.label }))}
      />
      {canEdit && choices?.ok ? (
        <DisruptionForm termId={term.id} choices={choices.data} departments={departmentNames} />
      ) : canEdit && choices && !choices.ok ? (
        <Problem title={t('page.errorTitle')} body={choices.message} />
      ) : null}

      <section aria-labelledby="p4-disruptions" className="flex flex-col gap-3">
        <h2 id="p4-disruptions" className="text-lg font-semibold">
          {t('disruptions.title')}
        </h2>
        <DisruptionList disruptions={disruptions.data} canEdit={canEdit} names={names} />
      </section>

      <section aria-labelledby="p4-cancelled" className="flex flex-col gap-3">
        <div>
          <h2 id="p4-cancelled" className="text-lg font-semibold">
            {t('cancelled.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('cancelled.description')}</p>
        </div>
        <CancelledList cancellations={cancelled.data} canEdit={canEdit} />
      </section>
    </>
  );
}
