'use client';

import {
  defaultTermLabel,
  sessionName,
  TERM_KINDS,
  TERM_STATUSES,
  type AcademicSessionRow,
  type TermRow,
} from '@slotwise/shared';
import { Badge, buttonVariants } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { EntityForm, type FieldSpec, type Values } from '@/components/entity/entity-form';
import { AddPanel, EntityList } from '@/components/entity/entity-list';
import { MakeCurrent } from './make-current';

export function TermsManager({
  sessions,
  terms,
  canManage,
}: {
  sessions: AcademicSessionRow[];
  terms: TermRow[];
  canManage: boolean;
}) {
  const t = useTranslations('terms');
  const tEnum = useTranslations('enums');
  const tEntity = useTranslations('entity');
  const thisYear = new Date().getFullYear();
  const latest = sessions[0];

  const termFields = (creating: boolean): FieldSpec[] => [
    ...(creating
      ? [
          {
            name: 'sessionId',
            label: t('session'),
            type: 'select',
            half: true,
            options: sessions.map((s) => ({ value: s.id, label: s.name })),
          } as FieldSpec,
          {
            name: 'kind',
            label: t('kind'),
            type: 'select',
            half: true,
            options: TERM_KINDS.map((k) => ({ value: k, label: tEnum(`termKind.${k}`) })),
          } as FieldSpec,
        ]
      : []),
    { name: 'label', label: t('label'), type: 'text', placeholder: 'July–Dec 2026' },
    { name: 'startDate', label: t('startDate'), type: 'date', half: true },
    { name: 'endDate', label: t('endDate'), type: 'date', half: true },
    {
      name: 'minTeachingDays',
      label: t('minTeachingDays'),
      hint: t('minTeachingDaysHint'),
      type: 'number',
      half: true,
      min: 0,
    },
    {
      name: 'status',
      label: t('status'),
      hint: t('statusHint'),
      type: 'select',
      half: true,
      options: TERM_STATUSES.map((s) => ({ value: s, label: tEnum(`termStatus.${s}`) })),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" className="text-lg font-semibold">
          {t('sessions')}
        </h2>
        {canManage ? (
          <AddPanel label={t('addSession')}>
            {(close) => (
              <EntityForm
                fields={[
                  {
                    name: 'startYear',
                    label: t('startYear'),
                    hint: t('startYearHint'),
                    type: 'number',
                    min: 2000,
                    max: 2100,
                  },
                ]}
                initial={{ startYear: latest ? latest.startYear + 1 : thisYear, name: null }}
                path="/sessions"
                id={null}
                revalidate="/terms"
                submitLabel={tEntity('add')}
                onCancel={close}
              />
            )}
          </AddPanel>
        ) : null}
        <p className="flex flex-wrap gap-2">
          {sessions.length === 0 ? (
            <span className="text-muted-foreground">{t('noSessions')}</span>
          ) : (
            sessions.map((s) => <Badge key={s.id}>{s.name}</Badge>)
          )}
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="terms-heading">
        <h2 id="terms-heading" className="text-lg font-semibold">
          {t('terms')}
        </h2>
        {canManage && sessions.length > 0 ? (
          <AddPanel label={t('addTerm')}>
            {(close) => (
              <EntityForm
                fields={termFields(true)}
                initial={{
                  sessionId: latest?.id ?? '',
                  kind: 'odd',
                  label: latest
                    ? defaultTermLabel({ sessionStartYear: latest.startYear, kind: 'odd' })
                    : '',
                  startDate: latest ? `${latest.startYear}-07-15` : '',
                  endDate: latest ? `${latest.startYear}-12-31` : '',
                  minTeachingDays: 90,
                  status: 'planning',
                }}
                path="/terms"
                id={null}
                revalidate="/terms"
                submitLabel={tEntity('add')}
                onCancel={close}
              />
            )}
          </AddPanel>
        ) : null}
        <EntityList
          rows={terms}
          path="/terms"
          revalidate="/terms"
          name={(r) => r.label}
          title={(r) => (
            <>
              {r.label}{' '}
              <Badge className={r.status === 'active' ? 'border-primary text-primary' : ''}>
                {tEnum(`termStatus.${r.status}`)}
              </Badge>
            </>
          )}
          subtitle={(r) =>
            t('termLine', {
              session: r.sessionName || sessionName(r.sessionStartYear),
              start: r.startDate,
              end: r.endDate,
              days: r.minTeachingDays,
            })
          }
          canEdit={() => canManage}
          empty={t('noTerms')}
          actions={(r) =>
            r.archivedAt ? null : (
              <>
                {canManage && r.status !== 'active' ? (
                  <MakeCurrent id={r.id} label={r.label} />
                ) : null}
                <Link href={`/terms/${r.id}`} className={buttonVariants({ size: 'sm' })}>
                  {t('open')}
                </Link>
              </>
            )
          }
          edit={(r, close) => (
            <EntityForm
              fields={termFields(false)}
              initial={r as unknown as Values}
              path="/terms"
              id={r.id}
              revalidate="/terms"
              submitLabel={tEntity('save')}
              onSaved={close}
              onCancel={close}
            />
          )}
        />
      </section>
    </div>
  );
}
