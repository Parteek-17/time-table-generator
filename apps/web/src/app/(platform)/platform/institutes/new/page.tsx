import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { auth } from '@/auth';
import { PageShell } from '@/components/page-shell';
import { CreateInstituteForm } from './create-institute-form';

export const metadata: Metadata = { title: 'New institute' };

/** The API refuses non-platform-admins; the form then shows its message. */
export default async function NewInstitutePage() {
  const [t, session] = await Promise.all([getTranslations('p7.platform'), auth()]);
  return (
    <PageShell email={session?.user?.email}>
      <Link href="/platform" className="text-sm text-primary underline-offset-4 hover:underline">
        ← {t('back')}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('newTitle')}</h1>
        <p className="text-muted-foreground">{t('newDescription')}</p>
      </div>
      <CreateInstituteForm />
    </PageShell>
  );
}
