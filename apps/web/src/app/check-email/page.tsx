import { Button, Card, CardDescription, CardHeader } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = { title: 'Check your email' };

export default async function CheckEmailPage() {
  const t = await getTranslations('checkEmail');
  const isDev = process.env.NODE_ENV !== 'production';
  return (
    <PageShell>
      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <CardDescription className="text-base">{t('body')}</CardDescription>
          {isDev ? (
            <p className="text-sm">
              {t('devHint')}{' '}
              <a className="text-primary underline" href="http://localhost:8025">
                localhost:8025
              </a>
            </p>
          ) : null}
          <Button asChild variant="outline" className="mt-2 self-start">
            <Link href="/sign-in">{t('tryAgain')}</Link>
          </Button>
        </CardHeader>
      </Card>
    </PageShell>
  );
}
