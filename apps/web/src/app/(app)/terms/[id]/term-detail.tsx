'use client';

import {
  ENTRY_TYPES,
  type GenerateCohortsResultDto,
  type PromotePreviewDto,
  type PromoteResultDto,
  type TermCohortWindowRow,
} from '@slotwise/shared';
import { Alert, Button, Checkbox, Label, NativeSelect } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import {
  EntityForm,
  type FieldSpec,
  type Option,
  type Values,
} from '@/components/entity/entity-form';
import { AddPanel, EntityList } from '@/components/entity/entity-list';
import { sendToApi } from '@/lib/entity-actions';
import { previewPromoteAction } from './actions';

const WINDOWS = '/term-cohort-windows';

/** Teaching start, preparatory holidays and end-sem exams per group of cohorts. */
export function WindowsManager({
  termId,
  rows,
  programmes,
  canManage,
}: {
  termId: string;
  rows: TermCohortWindowRow[];
  programmes: Option[];
  canManage: boolean;
}) {
  const t = useTranslations('terms');
  const tEnum = useTranslations('enums');
  const tEntity = useTranslations('entity');
  const revalidate = `/terms/${termId}`;
  const fields: FieldSpec[] = [
    { name: 'programmeId', label: t('programme'), type: 'select', half: true, options: programmes },
    {
      name: 'semesters',
      label: t('semesters'),
      hint: t('semestersHint'),
      type: 'numberList',
      half: true,
      placeholder: '3, 5, 7',
    },
    {
      name: 'entryType',
      label: t('entryType'),
      type: 'select',
      half: true,
      optional: true,
      emptyLabel: t('allEntries'),
      options: ENTRY_TYPES.map((e) => ({ value: e, label: tEnum(`entryType.${e}`) })),
    },
    { name: 'teachingStart', label: t('teachingStart'), type: 'date', half: true },
    { name: 'prepHolidaysStart', label: t('prepStart'), type: 'date', half: true, optional: true },
    { name: 'prepHolidaysEnd', label: t('prepEnd'), type: 'date', half: true, optional: true },
    { name: 'endSemExamStart', label: t('endSemStart'), type: 'date', half: true, optional: true },
  ];
  const label = (r: TermCohortWindowRow) =>
    `${r.programmeCode} ${r.semesters.length ? t('semList', { list: r.semesters.join(', ') }) : t('allSemesters')}${
      r.entryType ? ` · ${tEnum(`entryType.${r.entryType}`)}` : ''
    }`;
  return (
    <>
      {canManage ? (
        <AddPanel label={t('addWindow')}>
          {(close) => (
            <EntityForm
              fields={fields}
              initial={{
                termId,
                programmeId: '',
                semesters: [],
                entryType: null,
                teachingStart: '',
                prepHolidaysStart: null,
                prepHolidaysEnd: null,
                endSemExamStart: null,
              }}
              path={WINDOWS}
              id={null}
              revalidate={revalidate}
              submitLabel={tEntity('add')}
              onCancel={close}
            />
          )}
        </AddPanel>
      ) : null}
      <EntityList
        rows={rows}
        path={WINDOWS}
        revalidate={revalidate}
        name={label}
        title={label}
        subtitle={(r) =>
          [
            t('startsOn', { date: r.teachingStart }),
            r.prepHolidaysStart ? t('prepOn', { date: r.prepHolidaysStart }) : null,
            r.endSemExamStart ? t('examsOn', { date: r.endSemExamStart }) : null,
          ]
            .filter(Boolean)
            .join(' · ')
        }
        canEdit={() => canManage}
        empty={t('noWindows')}
        edit={(r, close) => (
          <EntityForm
            fields={fields}
            initial={r as unknown as Values}
            path={WINDOWS}
            id={r.id}
            revalidate={revalidate}
            submitLabel={tEntity('save')}
            onSaved={close}
            onCancel={close}
          />
        )}
      />
    </>
  );
}

/** Creates this term's cohorts from batches (semester worked out from the admission year). */
export function GenerateCohorts({ termId }: { termId: string }) {
  const t = useTranslations('terms');
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="self-start"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await sendToApi<GenerateCohortsResultDto>(
              'POST',
              `/terms/${termId}/cohorts/generate`,
              undefined,
              `/terms/${termId}`,
            );
            setMessage(
              res.ok && res.data
                ? { text: t('generated', { ...res.data }) }
                : { text: res.message ?? '', error: true },
            );
          })
        }
      >
        {pending ? t('working') : t('generate')}
      </Button>
      <p className="text-sm text-muted-foreground">{t('generateHint')}</p>
      <div aria-live="polite">
        {message ? (
          <Alert variant={message.error ? 'destructive' : 'success'}>{message.text}</Alert>
        ) : null}
      </div>
    </div>
  );
}

/** Preview, then promote every batch one semester up into the next term. */
export function PromotePanel({ fromTermId, toTerms }: { fromTermId: string; toTerms: Option[] }) {
  const t = useTranslations('terms');
  const id = useId();
  const [toTermId, setToTermId] = useState(toTerms[0]?.value ?? '');
  const [preview, setPreview] = useState<PromotePreviewDto | null>(null);
  const [skip, setSkip] = useState<string[]>([]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();

  const load = () =>
    start(async () => {
      const res = await previewPromoteAction(fromTermId, toTermId);
      setMessage(res.ok ? null : { text: res.message ?? '', error: true });
      setPreview(res.ok ? (res.data ?? null) : null);
      setSkip([]);
    });

  const commit = () =>
    start(async () => {
      const res = await sendToApi<PromoteResultDto>(
        'POST',
        `/terms/${fromTermId}/promote`,
        { toTermId, skipBatchIds: skip },
        `/terms/${fromTermId}`,
      );
      setMessage(
        res.ok && res.data
          ? { text: t('promoted', { ...res.data }) }
          : { text: res.message ?? '', error: true },
      );
      if (res.ok) setPreview(null);
    });

  const willPromote =
    preview?.rows.filter((r) => r.action !== 'already_exists' && !skip.includes(r.batchId)) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={id}>{t('promoteInto')}</Label>
          <NativeSelect id={id} value={toTermId} onChange={(e) => setToTermId(e.target.value)}>
            {toTerms.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button variant="outline" onClick={load} disabled={pending || !toTermId}>
          {t('preview')}
        </Button>
      </div>
      <div aria-live="polite">
        {message ? (
          <Alert variant={message.error ? 'destructive' : 'success'}>{message.text}</Alert>
        ) : null}
      </div>
      {preview ? (
        <>
          <ul className="flex flex-col divide-y rounded-xl border">
            {preview.rows.map((r) => (
              <li key={r.fromCohortId} className="flex flex-wrap items-center gap-3 p-3">
                <Checkbox
                  id={`skip-${r.batchId}`}
                  aria-label={t('includeLabel', { code: r.fromDisplayCode })}
                  disabled={r.action === 'already_exists'}
                  checked={r.action !== 'already_exists' && !skip.includes(r.batchId)}
                  onChange={(e) =>
                    setSkip((s) =>
                      e.target.checked ? s.filter((x) => x !== r.batchId) : [...s, r.batchId],
                    )
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {r.action === 'graduate'
                      ? t('rowGraduate', { code: r.fromDisplayCode, semester: r.fromSemester })
                      : r.action === 'already_exists'
                        ? t('rowExists', { code: r.fromDisplayCode })
                        : t('rowPromote', {
                            from: r.fromDisplayCode,
                            to: r.toDisplayCode ?? '',
                            semester: r.toSemester ?? 0,
                          })}
                  </p>
                  {r.action === 'promote' ? (
                    <p className="text-sm text-muted-foreground">
                      {r.joinsBatchId
                        ? t('rowJoins')
                        : t('rowSections', {
                            count: r.sections.length,
                            names: r.sections.map((s) => s.displayName).join(', '),
                          })}
                      {r.displayCodeNeedsReview ? ` · ${t('rowReviewCode')}` : ''}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <Button
            className="self-start"
            onClick={commit}
            disabled={pending || willPromote.length === 0}
          >
            {pending ? t('working') : t('promoteConfirm', { count: willPromote.length })}
          </Button>
        </>
      ) : null}
    </div>
  );
}
