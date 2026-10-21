'use server';

import { AuthError } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { EMAIL_PROVIDER, signIn } from '@/auth';
import { safeRedirectPath } from '@/lib/redirect';

export interface SignInState {
  error?: string;
  email?: string;
}

export async function signInWithEmail(_prev: SignInState, form: FormData): Promise<SignInState> {
  const t = await getTranslations('signIn');
  const email = z.email().trim().toLowerCase().safeParse(form.get('email'));
  if (!email.success) return { error: t('invalidEmail'), email: String(form.get('email') ?? '') };
  try {
    // Throws a redirect to /check-email on success.
    await signIn(EMAIL_PROVIDER, {
      email: email.data,
      redirectTo: safeRedirectPath(form.get('redirectTo')),
    });
  } catch (error) {
    if (error instanceof AuthError) return { error: t('errorDefault'), email: email.data };
    throw error;
  }
  return {};
}

export async function signInWithGoogle(form: FormData): Promise<void> {
  await signIn('google', { redirectTo: safeRedirectPath(form.get('redirectTo')) });
}
