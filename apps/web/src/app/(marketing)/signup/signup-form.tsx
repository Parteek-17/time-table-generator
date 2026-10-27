'use client';

import { isValidSlug } from '@slotwise/shared';
import { suggestSlug } from '@slotwise/shared/platform';
import { Alert, Button, FieldError, Input, Label, NativeSelect } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useState, type ReactNode } from 'react';
import { signupAction, slugAvailableAction, type SignupFormState } from './actions';

export function SignupForm({ rootDomain }: { rootDomain: string }) {
  const t = useTranslations('p7.signup');
  const [state, action, pending] = useActionState<SignupFormState, FormData>(signupAction, {
    status: 'idle',
  });
  const v = state.values ?? {};
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [check, setCheck] = useState<{ slug: string; available: boolean | null } | null>(null);

  // The address follows the name until the person edits it.
  const effectiveSlug = slugEdited ? slug : suggestSlug(name);
  const address = `${effectiveSlug}.${rootDomain}`;
  // Only an answer for what is in the box now counts.
  const available = check?.slug === effectiveSlug ? check.available : null;

  // "Is it free?" hint, once typing pauses.
  useEffect(() => {
    if (!isValidSlug(effectiveSlug)) return;
    const timer = setTimeout(() => {
      void slugAvailableAction(effectiveSlug).then((ok) =>
        setCheck({ slug: effectiveSlug, available: ok }),
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [effectiveSlug]);

  if (state.status === 'done' && state.result) {
    const host = new URL(state.result.url).host;
    return (
      <Alert variant="success" className="flex flex-col gap-2" role="status">
        <strong className="text-base">{t('doneTitle')}</strong>
        <span>{t('doneBody', { email: state.result.email, address: host })}</span>
        <span className="text-sm">{t('doneHint')}</span>
      </Alert>
    );
  }

  const err = (id: string) => (state.status === 'error' ? state.fieldErrors?.[id]?.[0] : undefined);
  const describedBy = (id: string, hint = false) =>
    [hint ? `${id}-hint` : null, err(id) ? `${id}-error` : null].filter(Boolean).join(' ') ||
    undefined;
  const field = (id: string, label: string, input: ReactNode, hint?: string) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {input}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {err(id) ? <FieldError id={`${id}-error`}>{err(id)}</FieldError> : null}
    </div>
  );

  const slugHint =
    available === true
      ? t('slugFree', { address })
      : available === false
        ? t('slugTaken', { address })
        : t('slugHint');

  return (
    <form action={action} className="relative flex flex-col gap-4" noValidate>
      {state.status === 'error' && !state.fieldErrors ? (
        <Alert variant="destructive">{state.message}</Alert>
      ) : null}

      {field(
        'instituteName',
        t('instituteName'),
        <Input
          id="instituteName"
          name="instituteName"
          required
          autoComplete="organization"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(err('instituteName'))}
          aria-describedby={describedBy('instituteName', true)}
        />,
        t('instituteNameHint'),
      )}

      {field(
        'slug',
        t('slug'),
        <div className="flex items-center gap-2">
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
            aria-invalid={Boolean(err('slug')) || available === false}
            aria-describedby={describedBy('slug', true)}
          />
          <span className="shrink-0 text-sm text-muted-foreground">.{rootDomain}</span>
        </div>,
        slugHint,
      )}

      {field(
        'type',
        t('type'),
        <NativeSelect id="type" name="type" defaultValue={v.type || 'college'}>
          <option value="college">{t('typeCollege')}</option>
          <option value="university">{t('typeUniversity')}</option>
        </NativeSelect>,
      )}

      {field(
        'affiliatingUniversityName',
        t('affiliatingUniversity'),
        <Input
          id="affiliatingUniversityName"
          name="affiliatingUniversityName"
          defaultValue={v.affiliatingUniversityName}
          aria-describedby={describedBy('affiliatingUniversityName')}
        />,
      )}

      {field(
        'adminName',
        t('adminName'),
        <Input
          id="adminName"
          name="adminName"
          required
          autoComplete="name"
          defaultValue={v.adminName}
          aria-invalid={Boolean(err('adminName'))}
          aria-describedby={describedBy('adminName')}
        />,
      )}

      {field(
        'adminEmail',
        t('adminEmail'),
        <Input
          id="adminEmail"
          name="adminEmail"
          type="email"
          required
          autoComplete="email"
          defaultValue={v.adminEmail}
          aria-invalid={Boolean(err('adminEmail'))}
          aria-describedby={describedBy('adminEmail', true)}
        />,
        t('adminEmailHint'),
      )}

      {/* Honeypot: hidden from people and screen readers, filled in by bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">{t('website')}</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
