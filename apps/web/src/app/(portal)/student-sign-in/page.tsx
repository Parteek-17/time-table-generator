import { isFlagOn, type InstituteDto } from '@slotwise/shared';
import { Card, CardContent, CardDescription, CardHeader } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { PageShell } from '@/components/page-shell';
import { api, getInstituteSlug } from '@/lib/api';
import { StudentSignInForm } from './student-sign-in-form';

export const metadata: Metadata = { title: 'Student sign-in' };

/** Students sign in with their roll number and a code sent to their email. No passwords. */
export default async function StudentSignInPage() {
  if (!isFlagOn('P5')) notFound();
  const slug = await getInstituteSlug();
  if (!slug) notFound();
  if ((await auth())?.user) redirect('/today');

  const t = await getTranslations('p5.signIn');
  const institute = await api<InstituteDto>('/institute');
  const name = institute.ok ? institute.data.name : undefined;

  return (
    <PageShell instituteName={name}>
      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold">
            {name ? t('title', { institute: name }) : t('titleGeneric')}
          </h1>
          <CardDescription className="text-base">{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <StudentSignInForm />
          <p className="text-sm text-muted-foreground">
            {t('staff')}{' '}
            <Link href="/sign-in" className="text-primary underline underline-offset-4">
              {t('staffLink')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
