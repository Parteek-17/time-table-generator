'use client';

import {
  assignableRoles,
  isScopeAllowedForRole,
  ROLES,
  type AuthUser,
  type DepartmentDto,
  type InstituteDto,
  type Role,
} from '@slotwise/shared';
import { Alert, Button, FieldError, Input, Label, NativeSelect } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { inviteAction, type InviteFormState } from './actions';

interface Place {
  /** "institute" or a department id. */
  value: string;
  label: string;
  roles: Role[];
}

export function InviteForm({
  user,
  institute,
  departments,
}: {
  user: AuthUser;
  institute: InstituteDto;
  departments: DepartmentDto[];
}) {
  const t = useTranslations('members');
  const tRoles = useTranslations('roles');
  const [state, action, pending] = useActionState<InviteFormState, FormData>(inviteAction, {
    status: 'idle',
  });
  const [role, setRole] = useState<Role | ''>('');
  const [where, setWhere] = useState('');
  const [copied, setCopied] = useState(false);

  // Every place this user may invite into, with the roles allowed there (via can()).
  const places = useMemo<Place[]>(() => {
    const base = {
      type: 'invite' as const,
      instituteId: institute.id,
      universityId: institute.parentUniversityId,
    };
    const all: Place[] = [
      {
        value: 'institute',
        label: t('wholeInstitute'),
        roles: assignableRoles(user, base).filter((r) => isScopeAllowedForRole(r, 'institute')),
      },
      ...departments.map((d) => ({
        value: d.id,
        label: d.name,
        roles: assignableRoles(user, { ...base, departmentId: d.id }).filter((r) =>
          isScopeAllowedForRole(r, 'department'),
        ),
      })),
    ];
    return all.filter((p) => p.roles.length > 0);
  }, [user, institute, departments, t]);

  const roleOptions = ROLES.filter((r) => places.some((p) => p.roles.includes(r)));
  const placeOptions = role ? places.filter((p) => p.roles.includes(role)) : [];
  const onlyPlace = placeOptions.length === 1 ? placeOptions[0]!.value : '';
  const effectiveWhere = placeOptions.some((p) => p.value === where) ? where : onlyPlace;

  if (roleOptions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('noPermission')}</p>;
  }

  const fieldError = (name: string) => state.status === 'error' && state.fieldErrors?.[name]?.[0];
  const whereError = fieldError('departmentId') || fieldError('scopeType');

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === 'sent' ? (
        <Alert variant="success">{t('invited', { email: state.email ?? '' })}</Alert>
      ) : null}
      {state.status === 'saved-no-email' && state.acceptUrl ? (
        <Alert variant="default" className="flex flex-col gap-2">
          <span>{t('invitedNoEmail', { email: state.email ?? '' })}</span>
          <code className="break-all rounded bg-muted p-2 text-xs">{state.acceptUrl}</code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start"
            onClick={async () => {
              await navigator.clipboard.writeText(state.acceptUrl ?? '');
              setCopied(true);
            }}
          >
            {copied ? t('copied') : t('copyLink')}
          </Button>
        </Alert>
      ) : null}
      {state.status === 'error' && !state.fieldErrors ? (
        <Alert variant="destructive" role="alert">
          {state.message}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-email">{t('email')}</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          required
          defaultValue={state.status === 'error' ? state.email : ''}
          key={state.status === 'sent' ? state.acceptUrl : 'email'}
          aria-invalid={fieldError('email') ? true : undefined}
          aria-describedby={fieldError('email') ? 'invite-email-error' : undefined}
        />
        {fieldError('email') ? (
          <FieldError id="invite-email-error">{fieldError('email')}</FieldError>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-role">{t('role')}</Label>
        <NativeSelect
          id="invite-role"
          name="role"
          required
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          <option value="" disabled>
            {t('chooseRole')}
          </option>
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {tRoles(r)}
            </option>
          ))}
        </NativeSelect>
      </div>

      {role ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-where">{t('where')}</Label>
          <NativeSelect
            id="invite-where"
            name="where"
            required
            value={effectiveWhere}
            onChange={(e) => setWhere(e.target.value)}
            aria-invalid={whereError ? true : undefined}
            aria-describedby={whereError ? 'invite-where-error' : undefined}
          >
            <option value="" disabled>
              {t('chooseDepartment')}
            </option>
            {placeOptions.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
          {whereError ? <FieldError id="invite-where-error">{whereError}</FieldError> : null}
        </div>
      ) : null}

      <Button
        type="submit"
        disabled={pending || !role || !effectiveWhere}
        className="sm:self-start"
      >
        {pending ? t('sending') : t('send')}
      </Button>
    </form>
  );
}
