import { IMPORT_TEMPLATES } from '@slotwise/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { getMe } from '@/lib/me';
import { pickTerm } from '@/lib/terms';
import { isKind, KIND_ORDER } from '../kinds';
import { UploadForm } from './upload-form';

export const metadata: Metadata = { title: 'Upload a file' };

/** Pick what to import (and the term for term-bound sheets), then upload the file. */
export default async function NewImportPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const me = await getMe('/imports/new');
  const t = await getTranslations('p1.imports');
  if (!me.may('import.run')) return <Problem title={t('title')} body={t('notAllowed')} />;
  const { terms, term } = await pickTerm(undefined);
  const chosen = isKind(kind) ? kind : null;

  return (
    <>
      <PageHeader
        title={chosen ? t('newTitle', { kind: t(`kind.${chosen}.title`) }) : t('newTitleAny')}
        description={chosen ? t(`kind.${chosen}.hint`) : t('subtitle')}
      />
      <UploadForm
        kinds={KIND_ORDER.map((k) => ({
          value: k,
          label: t(`kind.${k}.title`),
          term: IMPORT_TEMPLATES[k].term,
        }))}
        initialKind={chosen ?? KIND_ORDER[0]!}
        terms={terms.map((x) => ({ value: x.id, label: x.label }))}
        initialTerm={term?.id ?? ''}
      />
    </>
  );
}
