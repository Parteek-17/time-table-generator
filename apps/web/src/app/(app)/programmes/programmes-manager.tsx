'use client';

import {
  PROGRAMME_LEVELS,
  PROGRAMME_PRESETS,
  STUDY_MODES,
  type DepartmentRow,
  type ProgrammeRow,
} from '@slotwise/shared';
import { Badge, Button } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EntityForm, type FieldSpec, type Values } from '@/components/entity/entity-form';
import { AddPanel, EntityList } from '@/components/entity/entity-list';

const PATH = '/programmes';

function blank(): Values {
  return {
    code: '',
    name: '',
    level: 'ug',
    mode: 'full_time',
    totalSemesters: 8,
    lateralEntrySemester: null,
    hasBranches: true,
    departmentId: null,
  };
}

export function ProgrammesManager({
  rows,
  departments,
  canCreate,
  editable,
}: {
  rows: ProgrammeRow[];
  departments: DepartmentRow[];
  canCreate: boolean;
  editable: string[];
}) {
  const t = useTranslations('programmes');
  const tEnum = useTranslations('enums');
  const tEntity = useTranslations('entity');
  const [preset, setPreset] = useState<Values>(blank());
  const deptOptions = departments.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }));

  const fields = (creating: boolean): FieldSpec[] => [
    { name: 'code', label: t('code'), type: 'text', half: true, placeholder: 'BTECH' },
    { name: 'name', label: t('name'), type: 'text', half: true, placeholder: 'B.Tech' },
    {
      name: 'level',
      label: t('level'),
      type: 'select',
      half: true,
      options: PROGRAMME_LEVELS.map((v) => ({ value: v, label: tEnum(`level.${v}`) })),
    },
    {
      name: 'mode',
      label: t('mode'),
      type: 'select',
      half: true,
      options: STUDY_MODES.map((v) => ({ value: v, label: tEnum(`mode.${v}`) })),
    },
    {
      name: 'totalSemesters',
      label: t('totalSemesters'),
      type: 'number',
      half: true,
      min: 1,
      max: 12,
    },
    {
      name: 'lateralEntrySemester',
      label: t('lateralEntrySemester'),
      hint: t('lateralHint'),
      type: 'number',
      half: true,
      optional: true,
      min: 2,
      max: 12,
    },
    ...(creating
      ? [
          {
            name: 'hasBranches',
            label: t('hasBranches'),
            hint: t('hasBranchesHint'),
            type: 'checkbox',
          } as FieldSpec,
        ]
      : []),
    {
      name: 'departmentId',
      label: t('department'),
      hint: t('departmentHint'),
      type: 'select',
      optional: true,
      emptyLabel: t('wholeInstitute'),
      options: deptOptions,
    },
  ];

  return (
    <>
      {canCreate ? (
        <AddPanel label={t('add')}>
          {(close) => (
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-2 text-sm font-medium">{t('presets')}</p>
                <div className="flex flex-wrap gap-2">
                  {PROGRAMME_PRESETS.map((p) => (
                    <Button
                      key={p.code}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPreset({
                          ...blank(),
                          code: p.code,
                          name: p.name,
                          level: p.level,
                          totalSemesters: p.totalSemesters,
                          lateralEntrySemester: p.lateralEntrySemester,
                          hasBranches: p.hasBranches,
                        })
                      }
                    >
                      {t('presetLabel', { name: p.name, semesters: p.totalSemesters })}
                    </Button>
                  ))}
                </div>
              </div>
              <EntityForm
                key={JSON.stringify(preset)}
                fields={fields(true)}
                initial={preset}
                path={PATH}
                id={null}
                revalidate={PATH}
                submitLabel={tEntity('add')}
                onCancel={close}
              />
            </div>
          )}
        </AddPanel>
      ) : null}
      <EntityList
        rows={rows}
        path={PATH}
        revalidate={PATH}
        name={(r) => r.name}
        title={(r) => `${r.name} (${r.code})`}
        subtitle={(r) => (
          <div className="flex flex-col gap-1">
            <span>
              {t('summary', {
                semesters: r.totalSemesters,
                level: tEnum(`level.${r.level}`),
                department: r.departmentCode ?? t('wholeInstitute'),
              })}
              {r.lateralEntrySemester
                ? ` · ${t('leetAt', { semester: r.lateralEntrySemester })}`
                : ''}
            </span>
            <span className="flex flex-wrap gap-1">
              {r.branches
                .filter((b) => !b.isDefault)
                .map((b) => (
                  <Badge key={b.id}>
                    {b.code} · {b.departmentCode}
                  </Badge>
                ))}
            </span>
          </div>
        )}
        searchText={(r) => `${r.code} ${r.name} ${r.branches.map((b) => b.code).join(' ')}`}
        canEdit={(r) => editable.includes(r.id)}
        empty={t('empty')}
        edit={(r, close) => (
          <div className="flex flex-col gap-6">
            <EntityForm
              fields={fields(false)}
              initial={r as unknown as Values}
              path={PATH}
              id={r.id}
              revalidate={PATH}
              submitLabel={tEntity('save')}
              onSaved={close}
              onCancel={close}
            />
            {r.branches.some((b) => b.isDefault) ? null : (
              <Branches programme={r} deptOptions={deptOptions} />
            )}
          </div>
        )}
      />
    </>
  );
}

/** Branches of one programme (CSE, ECE, ME …), each owned by a department. */
function Branches({
  programme,
  deptOptions,
}: {
  programme: ProgrammeRow;
  deptOptions: { value: string; label: string }[];
}) {
  const t = useTranslations('programmes');
  const tEntity = useTranslations('entity');
  const fields: FieldSpec[] = [
    { name: 'code', label: t('branchCode'), type: 'text', half: true, placeholder: 'CSE' },
    {
      name: 'departmentId',
      label: t('branchDepartment'),
      type: 'select',
      half: true,
      options: deptOptions,
    },
    { name: 'name', label: t('branchName'), type: 'text' },
  ];
  return (
    <section className="flex flex-col gap-3" aria-label={t('branches')}>
      <h3 className="font-semibold">{t('branches')}</h3>
      <EntityList
        rows={programme.branches}
        path="/branches"
        revalidate={PATH}
        name={(b) => b.code}
        title={(b) => `${b.code} · ${b.name}`}
        subtitle={(b) => b.departmentCode}
        empty={t('noBranches')}
        edit={(b, close) => (
          <EntityForm
            fields={fields}
            initial={b as unknown as Values}
            path="/branches"
            id={b.id}
            revalidate={PATH}
            submitLabel={tEntity('save')}
            onSaved={close}
            onCancel={close}
          />
        )}
      />
      <AddPanel label={t('addBranch')}>
        {(close) => (
          <EntityForm
            fields={fields}
            initial={{ programmeId: programme.id, code: '', name: '', departmentId: '' }}
            path="/branches"
            id={null}
            revalidate={PATH}
            submitLabel={tEntity('add')}
            onCancel={close}
          />
        )}
      </AddPanel>
    </section>
  );
}
