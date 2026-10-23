import { isFlagOn, type Flag } from '@slotwise/shared';
import { Card, CardDescription, CardHeader, CardTitle } from '@slotwise/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from './app-shell';

/**
 * Placeholder page from C0 for a stream that has not shipped yet. 404 while the stream's flag
 * is off. `namespace` holds title, description, comingSoon and comingSoonBody.
 */
export async function ComingSoon({ flag, namespace }: { flag: Flag; namespace: string }) {
  if (!isFlagOn(flag)) notFound();
  const t = await getTranslations(namespace);
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Card>
        <CardHeader>
          <CardTitle>{t('comingSoon')}</CardTitle>
          <CardDescription className="text-base">{t('comingSoonBody')}</CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}
