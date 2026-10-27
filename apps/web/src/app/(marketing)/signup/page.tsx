import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageShell } from '@/components/page-shell';
import { SignupForm } from './signup-form';

export const metadata: Metadata = { title: 'Start your free trial' };

export default async function SignupPage() {
  const t = await getTranslations('p7.signup');
  return (
    <PageShell>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>
      <SignupForm rootDomain={process.env.WEB_ROOT_DOMAIN ?? 'localhost'} />
    </PageShell>
  );
}
