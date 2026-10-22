'use client';

import {
  splitEvenly,
  subGroupNames,
  type CohortRow,
  type ElectiveSectionRow,
  type SectionRow,
} from '@slotwise/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  NativeSelect,
} from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import {
  EntityForm,
  type FieldSpec,
  type Option,
  type Values,
} from '@/components/entity/entity-form';
import { AddPanel, EntityList } from '@/components/entity/entity-list';
import { saveEntity } from '@/lib/entity-actions';

/** Semester override, running toggle, display code, sitting in another cohort's sections. */
export function CohortSettings({
  cohort,
  canEdit,
  hosts,
}: {
  cohort: CohortRow;
  canEdit: boolean;
  hosts: Option[];
}) {
  const t = useTranslations('cohorts');
  const tEntity = useTranslations('entity');
  if (!canEdit) return null;
  const fields: FieldSpec[] = [
    {
      name: 'displayCode',
      label: t('displayCode'),
      hint: t('displayCodeHint'),
      type: 'text',
      half: true,
    },
    {
      name: 'semester',
      label: t('semester'),
      hint: t('semesterHint'),
      type: 'number',
      half: true,
      min: 1,
      max: 12,
    },
    { name: 'isRunning', label: t('isRunning'), hint: t('isRunningHint'), type: 'checkbox' },
    ...(cohort.entryType === 'lateral'
      ? [
          {
            name: 'joinsCohortId',
            label: t('joins'),
            hint: t('joinsHint'),
            type: 'select',
            optional: true,
            emptyLabel: t('ownSections'),
            options: hosts,
          } as FieldSpec,
        ]
      : []),
  ];
  return (
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer font-semibold">{t('settings')}</summary>
      <div className="mt-4">
        <EntityForm
          fields={fields}
          initial={cohort as unknown as Values}
          path="/cohorts"
          id={cohort.id}
          revalidate={`/cohorts/${cohort.id}`}
          submitLabel={tEntity('save')}
          resetOnCreate={false}
        />
      </div>
    </details>
  );
}

export function Sections({
  cohortId,
  rows,
  canEdit,
  prefix,
  rooms,
}: {
  cohortId: string;
  rows: SectionRow[];
  canEdit: boolean;
  prefix: string;
  rooms: Option[];
}) {
  const t = useTranslations('cohorts');
  const revalidate = `/cohorts/${cohortId}`;
  const total = rows.filter((r) => !r.archivedAt).reduce((a, r) => a + r.strength, 0);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="sections-heading">
      <h2 id="sections-heading" className="text-lg font-semibold">
        {t('sections')}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t('sectionsTotal', { count: rows.length, students: total })}
      </p>
      {canEdit ? (
        <AddPanel
          label={rows.length === 0 ? t('addSections') : t('addMoreSections')}
          defaultOpen={rows.length === 0}
        >
          {(close) => (
            <EntityForm
              fields={[
                { name: 'count', label: t('count'), type: 'number', half: true, min: 1, max: 26 },
                { name: 'strength', label: t('strengthEach'), type: 'number', half: true, min: 0 },
                {
                  name: 'subGroupsPerSection',
                  label: t('subGroupsPerSection'),
                  hint: t('subGroupsHint'),
                  type: 'number',
                  half: true,
                  min: 0,
                  max: 6,
                },
                {
                  name: 'prefix',
                  label: t('prefix'),
                  hint: t('prefixHint'),
                  type: 'text',
                  half: true,
                },
              ]}
              initial={{ count: 1, strength: 60, subGroupsPerSection: 2, prefix }}
              path={`/cohorts/${cohortId}/sections`}
              id={null}
              revalidate={revalidate}
              submitLabel={t('create')}
              onSaved={close}
              onCancel={close}
            />
          )}
        </AddPanel>
      ) : null}
      <EntityList
        rows={rows}
        path="/sections"
        revalidate={revalidate}
        name={(s) => s.displayName}
        title={(s) => t('sectionTitle', { name: s.displayName, strength: s.strength })}
        subtitle={(s) =>
          s.subGroups.length
            ? s.subGroups.map((g) => `${g.name}: ${g.strength}`).join(' · ')
            : t('noSubGroups')
        }
        canEdit={() => canEdit}
        empty={t('noSections')}
        edit={(s, close) => (
          <SectionForm section={s} rooms={rooms} revalidate={revalidate} onDone={close} />
        )}
      />
    </section>
  );
}

/** Section with its sub-groups; "Split evenly" fills the sub-group strengths. */
function SectionForm({
  section,
  rooms,
  revalidate,
  onDone,
}: {
  section: SectionRow;
  rooms: Option[];
  revalidate: string;
  onDone: () => void;
}) {
  const t = useTranslations('cohorts');
  const tEntity = useTranslations('entity');
  const uid = useId();
  const [name, setName] = useState(section.name);
  const [displayName, setDisplayName] = useState(section.displayName);
  const [strength, setStrength] = useState(String(section.strength));
  const [homeRoomId, setHomeRoomId] = useState(section.homeRoomId ?? '');
  const [groups, setGroups] = useState(
    section.subGroups.map((g) => ({ name: g.name, strength: String(g.strength) })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sum = groups.reduce((a, g) => a + (Number(g.strength) || 0), 0);
  const total = Number(strength) || 0;

  function split(count: number) {
    const names = subGroupNames(name, count);
    const parts = splitEvenly(total, count);
    setGroups(names.map((n, i) => ({ name: groups[i]?.name ?? n, strength: String(parts[i]) })));
  }

  function save() {
    start(async () => {
      const res = await saveEntity(
        '/sections',
        section.id,
        {
          cohortId: section.cohortId,
          name,
          displayName,
          strength: total,
          homeRoomId: homeRoomId || null,
          subGroups: groups.map((g) => ({ name: g.name, strength: Number(g.strength) || 0 })),
        },
        revalidate,
      );
      if (res.ok) onDone();
      else
        setError(
          [res.message, ...Object.values(res.fieldErrors ?? {}).flat()].filter(Boolean).join(' '),
        );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ['name', t('sectionName'), name, setName],
            ['display', t('displayName'), displayName, setDisplayName],
            ['strength', t('strength'), strength, setStrength],
          ] as const
        ).map(([key, label, value, set]) => (
          <div key={key} className="flex flex-col gap-2">
            <Label htmlFor={`${uid}-${key}`}>{label}</Label>
            <Input
              id={`${uid}-${key}`}
              inputMode={key === 'strength' ? 'numeric' : undefined}
              value={value}
              onChange={(e) => set(e.target.value)}
            />
          </div>
        ))}
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-room`}>{t('homeRoom')}</Label>
          <NativeSelect
            id={`${uid}-room`}
            value={homeRoomId}
            onChange={(e) => setHomeRoomId(e.target.value)}
          >
            <option value="">{tEntity('none')}</option>
            {rooms.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('subGroups')}</legend>
        {groups.map((g, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <Input
              aria-label={t('subGroupName', { n: i + 1 })}
              className="w-24"
              value={g.name}
              onChange={(e) =>
                setGroups(groups.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))
              }
            />
            <Input
              aria-label={t('subGroupStrength', { name: g.name })}
              className="w-24"
              inputMode="numeric"
              value={g.strength}
              onChange={(e) =>
                setGroups(groups.map((x, k) => (k === i ? { ...x, strength: e.target.value } : x)))
              }
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setGroups(groups.filter((_, k) => k !== i))}
            >
              {t('removeSubGroup')}
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => split(Math.max(groups.length, 2))}>
            {t('splitEvenly')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => split(groups.length + 1)}>
            {t('addSubGroup')}
          </Button>
        </div>
        {groups.length > 0 ? (
          <p
            className={
              sum === total
                ? 'text-sm text-muted-foreground'
                : 'text-sm font-medium text-destructive'
            }
          >
            {sum === total ? t('addsUp', { sum }) : t('doesNotAddUp', { sum, total })}
          </p>
        ) : null}
      </fieldset>
      {error ? (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? tEntity('saving') : tEntity('save')}
        </Button>
        <Button variant="outline" onClick={onDone}>
          {tEntity('cancel')}
        </Button>
      </div>
    </div>
  );
}

/** Elective sections: students of one elective course, drawn from one or more sections. */
export function ElectiveSections({
  cohortId,
  termId,
  rows,
  canEdit,
  courses,
  sections,
}: {
  cohortId: string;
  termId: string;
  rows: ElectiveSectionRow[];
  canEdit: boolean;
  courses: Option[];
  sections: Option[];
}) {
  const t = useTranslations('cohorts');
  const tEntity = useTranslations('entity');
  const revalidate = `/cohorts/${cohortId}`;
  const fields: FieldSpec[] = [
    { name: 'courseId', label: t('electiveCourse'), type: 'select', options: courses },
    { name: 'name', label: t('electiveName'), type: 'text', half: true, placeholder: 'ML-1' },
    { name: 'strength', label: t('strength'), type: 'number', half: true, min: 0 },
    {
      name: 'sourceSectionIds',
      label: t('fromSections'),
      hint: t('fromSectionsHint'),
      type: 'multiselect',
      options: sections,
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('electives')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('electivesHint')}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {canEdit ? (
          <AddPanel label={t('addElective')}>
            {(close) => (
              <EntityForm
                fields={fields}
                initial={{ termId, courseId: '', name: '', strength: 0, sourceSectionIds: [] }}
                path="/elective-sections"
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
          path="/elective-sections"
          revalidate={revalidate}
          name={(e) => e.name}
          title={(e) => `${e.name} · ${e.courseCode}`}
          subtitle={(e) =>
            t('electiveLine', {
              strength: e.strength,
              sections: e.sourceSectionIds
                .map((s) => sections.find((o) => o.value === s)?.label ?? '?')
                .join(', '),
            })
          }
          canEdit={() => canEdit}
          empty={t('noElectives')}
          edit={(e, close) => (
            <EntityForm
              fields={fields}
              initial={e as unknown as Values}
              path="/elective-sections"
              id={e.id}
              revalidate={revalidate}
              submitLabel={tEntity('save')}
              onSaved={close}
              onCancel={close}
            />
          )}
        />
      </CardContent>
    </Card>
  );
}
