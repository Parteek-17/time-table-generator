'use client';

import type {
  TeachingCellDto,
  TeachingFacultyDto,
  TeachingGridDto,
  TeachingRowDto,
} from '@slotwise/shared';
import { Alert, Badge, Button, cn, Label, NativeSelect } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useId, useMemo, useState, useTransition } from 'react';
import { sendToApi } from '@/lib/entity-actions';

const REVALIDATE = '/teaching';

interface Notice {
  text: string;
  error?: boolean;
  undo?: () => void;
}

/**
 * Pick a teacher per course part and section. Every pick saves at once and shows each
 * teacher's periods a week against their limit (across departments), with Undo instead of
 * a confirm (CLAUDE.md "Undo instead of confirm").
 */
export function TeachingGrid({ initial, canEdit }: { initial: TeachingGridDto; canEdit: boolean }) {
  const t = useTranslations('p1.teaching');
  const [grid, setGrid] = useState(initial);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, startTransition] = useTransition();
  const facultyById = useMemo(() => new Map(grid.faculty.map((f) => [f.id, f])), [grid.faculty]);
  const cohortId = grid.cohort.id;

  function send(path: 'cells' | 'mentors', body: object, undoBody?: object) {
    startTransition(async () => {
      const res = await sendToApi<TeachingGridDto>(
        'PUT',
        `/teaching/${cohortId}/${path}`,
        body,
        REVALIDATE,
      );
      if (!res.ok || !res.data) {
        setNotice({ text: res.message ?? t('notAllowed'), error: true });
        return;
      }
      setGrid(res.data);
      setNotice({
        text: t('saved'),
        undo: undoBody ? () => send(path, undoBody) : undefined,
      });
    });
  }

  function setCell(
    row: TeachingRowDto,
    cell: TeachingCellDto,
    facultyId: string | null,
    co: string[],
  ) {
    const base = {
      courseId: row.courseId,
      component: row.component,
      target: cell.target,
      targetId: cell.targetId,
    };
    send(
      'cells',
      { ...base, facultyId, coTeacherIds: co },
      { ...base, facultyId: cell.facultyId, coTeacherIds: cell.coTeacherIds },
    );
  }

  const done = grid.cells - grid.missing;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-medium">{t('progress', { done, total: grid.cells })}</p>
        {!canEdit ? <p className="text-sm text-muted-foreground">{t('notAllowed')}</p> : null}
      </div>
      <div aria-live="polite" className="empty:hidden">
        {notice ? (
          <Alert
            variant={notice.error ? 'destructive' : 'success'}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>{notice.text}</span>
            {notice.undo ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  const undo = notice.undo!;
                  setNotice(null);
                  undo();
                }}
              >
                {t('undo')}
              </Button>
            ) : null}
          </Alert>
        ) : null}
      </div>

      <ul className="grid gap-3 lg:grid-cols-2">
        {grid.rows.map((row) => (
          <li
            key={`${row.courseId}|${row.component}`}
            className="flex flex-col gap-3 rounded-xl border p-3"
          >
            <div>
              <p className="font-medium">
                {row.courseCode} {row.courseTitle} <ComponentBadge component={row.component} />
              </p>
              <p className="text-sm text-muted-foreground">
                {t('periods', { count: row.periods })}
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {row.cells.map((cell) => (
                <CellEditor
                  key={cell.targetId}
                  row={row}
                  cell={cell}
                  faculty={grid.faculty}
                  facultyById={facultyById}
                  disabled={!canEdit || pending}
                  onChange={(facultyId, co) => setCell(row, cell, facultyId, co)}
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {grid.mentors.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="mentors-heading">
          <div>
            <h2 id="mentors-heading" className="text-lg font-semibold">
              {t('mentorsHeading')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('mentorsHint')}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {grid.mentors.map((m) => (
              <li key={m.courseId}>
                <FacultySelect
                  label={`${m.courseCode} ${m.courseTitle}`}
                  ariaLabel={t('mentorFor', { course: `${m.courseCode} ${m.courseTitle}` })}
                  value={m.facultyId}
                  faculty={grid.faculty}
                  disabled={!canEdit || pending}
                  onChange={(facultyId) =>
                    send(
                      'mentors',
                      { courseId: m.courseId, facultyId },
                      { courseId: m.courseId, facultyId: m.facultyId },
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ComponentBadge({ component }: { component: TeachingRowDto['component'] }) {
  const tEnum = useTranslations('enums');
  return (
    <Badge title={tEnum(`componentName.${component}`)}>{tEnum(`componentName.${component}`)}</Badge>
  );
}

function CellEditor({
  row,
  cell,
  faculty,
  facultyById,
  disabled,
  onChange,
}: {
  row: TeachingRowDto;
  cell: TeachingCellDto;
  faculty: TeachingFacultyDto[];
  facultyById: Map<string, TeachingFacultyDto>;
  disabled: boolean;
  onChange: (facultyId: string | null, coTeacherIds: string[]) => void;
}) {
  const t = useTranslations('p1.teaching');
  const tEnum = useTranslations('enums');
  const coId = useId();
  const part = tEnum(`componentLetter.${row.component}`);
  const where = { course: row.courseCode, part, group: cell.targetName };
  const main = cell.facultyId ? facultyById.get(cell.facultyId) : undefined;
  const others = faculty.filter(
    (f) => f.id !== cell.facultyId && !cell.coTeacherIds.includes(f.id),
  );

  return (
    <li className={cn('flex flex-col gap-2', !cell.facultyId && 'rounded-lg bg-destructive/5 p-2')}>
      <FacultySelect
        label={`${cell.targetName} (${cell.strength})`}
        ariaLabel={t('teacher', where)}
        value={cell.facultyId}
        faculty={faculty}
        disabled={disabled}
        onChange={(id) =>
          onChange(
            id,
            cell.coTeacherIds.filter((x) => x !== id),
          )
        }
      />
      {main ? <LoadBadge f={main} /> : null}
      {cell.coTeacherIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('coTeachers')}:</span>
          {cell.coTeacherIds.map((id) => {
            const f = facultyById.get(id);
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
                {f?.name ?? '?'} {f ? <LoadText f={f} /> : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  disabled={disabled}
                  aria-label={t('removeCoTeacher', { name: f?.name ?? '' })}
                  onClick={() =>
                    onChange(
                      cell.facultyId,
                      cell.coTeacherIds.filter((x) => x !== id),
                    )
                  }
                >
                  ×
                </Button>
              </span>
            );
          })}
        </div>
      ) : null}
      {cell.facultyId && !disabled ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={coId} className="sr-only">
            {t('addCoTeacher', where)}
          </Label>
          <NativeSelect
            id={coId}
            value=""
            className="h-9 text-sm"
            onChange={(e) => {
              if (e.target.value) onChange(cell.facultyId, [...cell.coTeacherIds, e.target.value]);
            }}
          >
            <option value="">{t('addCoTeacher', where)}</option>
            {others.map((f) => (
              <FacultyOption key={f.id} f={f} />
            ))}
          </NativeSelect>
        </div>
      ) : null}
    </li>
  );
}

function FacultySelect({
  label,
  ariaLabel,
  value,
  faculty,
  disabled,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: string | null;
  faculty: TeachingFacultyDto[];
  disabled: boolean;
  onChange: (facultyId: string | null) => void;
}) {
  const t = useTranslations('p1.teaching');
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        aria-label={ariaLabel}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{t('nobody')}</option>
        {faculty.map((f) => (
          <FacultyOption key={f.id} f={f} />
        ))}
      </NativeSelect>
    </div>
  );
}

function FacultyOption({ f }: { f: TeachingFacultyDto }) {
  const t = useTranslations('p1.teaching');
  return (
    <option value={f.id}>
      {t('facultyOption', {
        name: f.name,
        code: f.shortCode,
        dept: f.departmentCode,
        assigned: f.assigned,
        max: f.max,
      })}
    </option>
  );
}

/** "12/14" plus the status in words (never colour alone). */
function LoadBadge({ f }: { f: TeachingFacultyDto }) {
  return (
    <p className="text-sm">
      <LoadText f={f} />
    </p>
  );
}

function LoadText({ f }: { f: TeachingFacultyDto }) {
  const t = useTranslations('p1.teaching');
  const words =
    f.status === 'over' ? t('loadOver') : f.status === 'under' ? t('loadUnder') : t('loadOk');
  return (
    <Badge
      className={cn(
        f.status === 'over' && 'border-destructive/50 bg-destructive/10',
        f.status === 'ok' && 'border-success/40 bg-success/10',
      )}
    >
      {t('load', { assigned: f.assigned, max: f.max })}
      <span className="ml-1 font-normal">{words}</span>
    </Badge>
  );
}
