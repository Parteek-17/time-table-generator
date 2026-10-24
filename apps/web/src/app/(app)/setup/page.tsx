import type { SetupStateDto } from '@slotwise/shared';
import {
  Badge,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { getMe } from '@/lib/me';
import { ProgressBar } from './progress.local';
import { SampleDataButton } from './wizard-nav';

export const metadata: Metadata = { title: 'Set up your institute' };

/**
 * Setup overview: progress, what needs attention (with the screen that fixes it), every
 * step, and "Try with sample data". Admins land here until setup is done.
 */
export default async function SetupPage() {
  const me = await getMe('/setup');
  const t = await getTranslations('p1.setup');
  const res = await api<SetupStateDto>('/setup');
  if (!res.ok) return <Problem title={t('title')} body={res.message} />;
  const state = res.data;
  const canEdit = me.may('institute.manage');
  const done = state.nextStep == null;

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')}>
        {done ? null : (
          <Link href={`/setup/${state.nextStep}`} className={buttonVariants()}>
            {state.percent === 0 ? t('start') : t('resume')}
          </Link>
        )}
      </PageHeader>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t('percentDone', { percent: state.percent })}</p>
        <ProgressBar value={state.percent} label={t('percentDone', { percent: state.percent })} />
        {done ? <p className="text-sm text-muted-foreground">{t('allDone')}</p> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('attentionTitle')}</CardTitle>
          <CardDescription>
            {state.attention.length === 0 ? t('attentionNone') : t('attentionHint')}
          </CardDescription>
        </CardHeader>
        {state.attention.length > 0 ? (
          <CardContent>
            <ul className="flex flex-col gap-2">
              {state.attention.map((a) => (
                <li key={a.code} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{t(`attention.${a.code}`, { count: a.count })}</span>
                  <Link
                    href={a.href}
                    className={buttonVariants({ size: 'sm', variant: 'outline' })}
                  >
                    {t('fix')}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        ) : null}
      </Card>

      <section aria-labelledby="steps-heading" className="flex flex-col gap-3">
        <h2 id="steps-heading" className="text-lg font-semibold">
          {t('stepsTitle')}
        </h2>
        <ol className="flex flex-col divide-y rounded-xl border">
          {state.steps.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                  s.status === 'done' && 'border-primary bg-primary text-primary-foreground',
                )}
              >
                {s.status === 'done' ? '✓' : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t(`step.${s.id}.title`)}</p>
                <p className="text-sm text-muted-foreground">
                  {s.available ? t(`step.${s.id}.summary`, { count: s.count }) : t('later')}
                </p>
              </div>
              <Badge>{t(`status.${s.available ? s.status : 'later'}`)}</Badge>
              {s.available ? (
                <Link
                  href={`/setup/${s.id}`}
                  className={buttonVariants({ size: 'sm', variant: 'outline' })}
                  aria-label={t('openStep', { step: t(`step.${s.id}.title`) })}
                >
                  {s.status === 'todo' ? t('open') : t('review')}
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('sampleTitle')}</CardTitle>
            <CardDescription>{t('sampleHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <SampleDataButton />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
