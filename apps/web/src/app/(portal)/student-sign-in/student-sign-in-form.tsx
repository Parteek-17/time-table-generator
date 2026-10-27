'use client';

import { Button, FieldError, Input, Label } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { studentSignIn, type StudentSignInState } from './actions';

/** Two short steps on one screen: roll number, then the code from the email. */
export function StudentSignInForm() {
  const t = useTranslations('p5.signIn');
  const [state, action, pending] = useActionState<StudentSignInState, FormData>(studentSignIn, {
    step: 'roll',
  });

  if (state.step === 'roll') {
    return (
      <form action={action} className="flex flex-col gap-3" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rollNumber">{t('rollLabel')}</Label>
          <Input
            id="rollNumber"
            name="rollNumber"
            autoComplete="username"
            autoCapitalize="characters"
            spellCheck={false}
            defaultValue={state.rollNumber}
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? 'roll-error' : 'roll-hint'}
          />
          <p id="roll-hint" className="text-sm text-muted-foreground">
            {t('rollHint')}
          </p>
          {state.error ? <FieldError id="roll-error">{state.error}</FieldError> : null}
        </div>
        <Button type="submit" name="intent" value="send" disabled={pending}>
          {pending ? t('sending') : t('sendCode')}
        </Button>
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <p role="status">
        {state.resent
          ? t('sentAgain', { email: state.maskedEmail ?? '' })
          : t('sent', { email: state.maskedEmail ?? '' })}
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">{t('codeLabel')}</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          className="text-2xl tracking-[0.4em] tabular-nums"
          autoFocus
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? 'code-error' : 'code-hint'}
        />
        <p id="code-hint" className="text-sm text-muted-foreground">
          {t('codeHint', { roll: state.rollNumber ?? '' })}
        </p>
        {state.error ? <FieldError id="code-error">{state.error}</FieldError> : null}
      </div>
      <Button type="submit" name="intent" value="verify" disabled={pending}>
        {pending ? t('checking') : t('signIn')}
      </Button>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="resend" variant="outline" disabled={pending}>
          {t('resend')}
        </Button>
        <Button type="submit" name="intent" value="restart" variant="ghost" disabled={pending}>
          {t('otherRoll')}
        </Button>
      </div>
    </form>
  );
}
