'use client';

import { Button, FieldError, Input, Label } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { signInWithEmail, signInWithGoogle, type SignInState } from '@/app/sign-in/actions';

export function SignInForm({
  redirectTo = '/',
  defaultEmail = '',
  googleEnabled,
}: {
  redirectTo?: string;
  defaultEmail?: string;
  googleEnabled: boolean;
}) {
  const t = useTranslations('signIn');
  const [state, action, pending] = useActionState<SignInState, FormData>(signInWithEmail, {
    email: defaultEmail,
  });

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{t('email')}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t('emailPlaceholder')}
            defaultValue={state.email}
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? 'email-error' : undefined}
          />
          {state.error ? <FieldError id="email-error">{state.error}</FieldError> : null}
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? t('sending') : t('sendLink')}
        </Button>
      </form>

      {googleEnabled ? (
        <>
          <p className="text-center text-sm text-muted-foreground">{t('or')}</p>
          <form action={signInWithGoogle}>
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <Button type="submit" variant="outline" className="w-full">
              {t('google')}
            </Button>
          </form>
        </>
      ) : null}
    </div>
  );
}
