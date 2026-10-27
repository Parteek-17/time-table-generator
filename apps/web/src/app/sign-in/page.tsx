import { isFlagOn, type InstituteDto } from '@slotwise/shared';
import { Alert, Card, CardContent, CardDescription, CardHeader } from '@slotwise/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { PageShell } from '@/components/page-shell';
import { SignInForm } from '@/components/sign-in-form';
import { api, getInstituteSlug } from '@/lib/api';
import { googleSignInEnabled } from '@/lib/env';
import { safeRedirectPath } from '@/lib/redirect';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const redirectTo = safeRedirectPath(callbackUrl);
  if ((await auth())?.user) redirect(redirectTo);

  const t = await getTranslations('signIn');
  const slug = await getInstituteSlug();
  const institute = slug ? await api<InstituteDto>('/institute') : null;
  const name = institute?.ok ? institute.data.name : undefined;

  return (
    <PageShell instituteName={name}>
      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold">
            {name ? t('title', { institute: name }) : t('titleGeneric')}
          </h1>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? (
            <Alert variant="destructive" role="alert">
              {error === 'Verification' ? t('errorVerification') : t('errorDefault')}
            </Alert>
          ) : null}
          <SignInForm redirectTo={redirectTo} googleEnabled={googleSignInEnabled()} />
          {slug && isFlagOn('P5') ? (
            <p className="text-sm text-muted-foreground">
              {t('student')}{' '}
              <Link href="/student-sign-in" className="text-primary underline underline-offset-4">
                {t('studentLink')}
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  );
}
