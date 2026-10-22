import { CALENDAR_SCOPES } from '@slotwise/shared';
import type { FieldSpec, Option } from './entity-form';

export interface ScopeOptions {
  departments: Option[];
  programmes: Option[];
  cohorts: Option[];
  sections?: Option[];
}

type T = (key: string) => string;

/**
 * "Applies to": whole institute, or one department / programme / cohort / section, with the
 * matching picker shown only for the chosen kind.
 */
export function scopeFields(options: ScopeOptions, t: T, tEnum: T): FieldSpec[] {
  const scopes = CALENDAR_SCOPES.filter((s) => s !== 'section' || options.sections);
  return [
    {
      name: 'scopeType',
      label: t('appliesTo'),
      type: 'select',
      half: true,
      options: scopes.map((s) => ({ value: s, label: tEnum(`scope.${s}`) })),
    },
    {
      name: 'departmentId',
      label: t('department'),
      type: 'select',
      half: true,
      options: options.departments,
      show: (v) => v.scopeType === 'department',
    },
    {
      name: 'programmeId',
      label: t('programme'),
      type: 'select',
      half: true,
      options: options.programmes,
      show: (v) => v.scopeType === 'programme',
    },
    {
      name: 'cohortId',
      label: t('cohort'),
      type: 'select',
      half: true,
      options: options.cohorts,
      show: (v) => v.scopeType === 'cohort',
    },
    {
      name: 'sectionId',
      label: t('section'),
      type: 'select',
      half: true,
      options: options.sections ?? [],
      show: (v) => v.scopeType === 'section',
    },
  ];
}

export const institutionScope = {
  scopeType: 'institute',
  departmentId: null,
  programmeId: null,
  cohortId: null,
  sectionId: null,
};

/** "Whole institute" or the name of the department/programme/cohort it applies to. */
export function scopeLabel(
  row: {
    scopeType: string;
    departmentId: string | null;
    programmeId: string | null;
    cohortId: string | null;
  },
  options: ScopeOptions,
  wholeInstitute: string,
): string {
  const find = (list: Option[], id: string | null) =>
    list.find((o) => o.value === id)?.label ?? '?';
  switch (row.scopeType) {
    case 'department':
      return find(options.departments, row.departmentId);
    case 'programme':
      return find(options.programmes, row.programmeId);
    case 'cohort':
      return find(options.cohorts, row.cohortId);
    default:
      return wholeInstitute;
  }
}
