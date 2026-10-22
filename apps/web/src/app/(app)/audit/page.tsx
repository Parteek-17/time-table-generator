import type { AuditRow } from '@slotwise/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { getMe } from '@/lib/me';

export const metadata: Metadata = { title: 'Recent changes' };

/** Read-only log of who changed what. */
export default async function AuditPage() {
  const me = await getMe('/audit');
  const t = await getTranslations('audit');
  if (!me.may('audit.view')) return <Problem title={t('title')} body={t('noPermission')} />;
  const res = await api<AuditRow[]>('/audit?limit=200');
  if (!res.ok) return <Problem title={res.message} />;
  const when = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: me.institute.timezone,
  });
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      {res.data.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {res.data.map((row) => {
            const changes = row.metadata.changes as
              Record<string, { from: unknown; to: unknown }> | undefined;
            const changed = changes ? Object.keys(changes) : [];
            return (
              <li key={row.id} className="flex flex-col gap-1 p-3">
                <p className="font-medium">{describe(row.action, t)}</p>
                <p className="text-sm text-muted-foreground">
                  {t('by', {
                    who: row.actor?.name ?? row.actor?.email ?? t('system'),
                    when: when.format(new Date(row.createdAt)),
                  })}
                </p>
                {changed.length > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('fields', { list: changed.join(', ') })}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** "programme.created" → "Programme added" (falls back to the raw action). */
function describe(
  action: string,
  t: (key: string, values?: Record<string, string>) => string,
): string {
  const [target, verb] = action.split('.');
  const thing = (target ?? '').replace(/_/g, ' ');
  const known = ['created', 'updated', 'archived', 'restored'];
  if (verb && known.includes(verb))
    return t(`verb.${verb}`, { thing: thing.charAt(0).toUpperCase() + thing.slice(1) });
  return action.replace(/[._]/g, ' ');
}
