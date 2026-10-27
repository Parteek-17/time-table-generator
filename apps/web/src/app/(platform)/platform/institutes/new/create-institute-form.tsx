'use client';

import { DEFAULT_PLAN, PLAN_CODES, PLANS, suggestSlug } from '@slotwise/shared/platform';
import { Alert, Button, Checkbox, FieldError, Input, Label, NativeSelect } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useActionState, useState, type ReactNode } from 'react';
import { createInstituteAction, type CreateInstituteState } from '../../actions';

export function CreateInstituteForm() {
  const t = useTranslations('p7.platform');
  const tSignup = useTranslations('p7.signup');
  const [state, action, pending] = useActionState<CreateInstituteState, FormData>(
    createInstituteAction,
    { status: 'idle' },
  );
  const v = state.values ?? {};
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const effectiveSlug = slugEdited ? slug : suggestSlug(name);

  const err = (id: string) => (state.status === 'error' ? state.fieldErrors?.[id]?.[0] : undefined);
  const field = (id: string, label: string, input: ReactNode) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {input}
      {err(id) ? <FieldError id={`${id}-error`}>{err(id)}</FieldError> : null}
    </div>
  );
  const invalid = (id: string) => ({
    'aria-invalid': Boolean(err(id)),
    'aria-describedby': err(id) ? `${id}-error` : undefined,
  });

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === 'done' && state.result ? (
        <Alert variant="success" role="status" className="flex flex-col gap-1">
          <strong>{t('createdTitle', { name: state.result.name })}</strong>
          <span className="break-all">
            {t('createdBody', { email: state.result.email, url: state.result.url })}
          </span>
          {state.planError ? <span>{t('planNotSaved', { message: state.planError })}</span> : null}
        </Alert>
      ) : null}
      {state.status === 'error' && !state.fieldErrors ? (
        <Alert variant="destructive">{state.message}</Alert>
      ) : null}

      {field(
        'name',
        tSignup('instituteName'),
        <Input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          {...invalid('name')}
        />,
      )}
      {field(
        'slug',
        tSignup('slug'),
        <Input
          id="slug"
          name="slug"
          required
          autoCapitalize="none"
          spellCheck={false}
          value={effectiveSlug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(e.target.value.toLowerCase());
          }}
          {...invalid('slug')}
        />,
      )}
      {field(
        'type',
        tSignup('type'),
        <NativeSelect id="type" name="type" defaultValue={v.type || 'college'}>
          <option value="college">{tSignup('typeCollege')}</option>
          <option value="university">{tSignup('typeUniversity')}</option>
        </NativeSelect>,
      )}
      {field(
        'affiliatingUniversityName',
        tSignup('affiliatingUniversity'),
        <Input
          id="affiliatingUniversityName"
          name="affiliatingUniversityName"
          defaultValue={v.affiliatingUniversityName}
          {...invalid('affiliatingUniversityName')}
        />,
      )}
      {field(
        'adminName',
        t('firstAdminName'),
        <Input
          id="adminName"
          name="adminName"
          required
          defaultValue={v.adminName}
          {...invalid('adminName')}
        />,
      )}
      {field(
        'adminEmail',
        t('firstAdminEmail'),
        <Input
          id="adminEmail"
          name="adminEmail"
          type="email"
          required
          defaultValue={v.adminEmail}
          {...invalid('adminEmail')}
        />,
      )}
      {field(
        'planCode',
        t('planLabel'),
        <NativeSelect id="planCode" name="planCode" defaultValue={v.planCode || DEFAULT_PLAN}>
          {PLAN_CODES.map((code) => (
            <option key={code} value={code}>
              {PLANS[code].name}
            </option>
          ))}
        </NativeSelect>,
      )}
      <div className="flex items-center gap-3">
        <Checkbox
          id="withSampleData"
          name="withSampleData"
          defaultChecked={v.withSampleData === 'on'}
        />
        <Label htmlFor="withSampleData">{t('withSampleData')}</Label>
      </div>

      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? t('creating') : t('create')}
      </Button>
    </form>
  );
}
