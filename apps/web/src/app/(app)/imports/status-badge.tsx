import type { ImportStatusName } from '@slotwise/shared';
import { Badge, cn } from '@slotwise/ui';
import { getTranslations } from 'next-intl/server';

const TONE: Partial<Record<ImportStatusName, string>> = {
  committed: 'border-success/40 bg-success/10',
  failed: 'border-destructive/50 bg-destructive/10',
};

/** Status in words (never colour alone). */
export async function StatusBadge({ status }: { status: ImportStatusName }) {
  const t = await getTranslations('p1.imports.status');
  return <Badge className={cn(TONE[status])}>{t(status)}</Badge>;
}
