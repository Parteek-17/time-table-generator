import type { PortalFeedV1 } from '@slotwise/shared/portal';
import { Button, buttonVariants, Card, CardContent, CardHeader, CardTitle } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { api } from '@/lib/api';
import { CopyField } from '../../_components/copy-field';
import { PortalProblem, PortalTabs } from '../../_components/portal-ui';
import { absoluteUrl } from '../../_components/public-api';
import { resetFeed } from './actions';

export const metadata: Metadata = { title: 'Add to your calendar' };

/**
 * The signed-in person's calendar subscription: one tap for Google Calendar or the phone's
 * calendar; classes, cancellations and holidays follow automatically.
 */
export default async function CalendarPage() {
  const [t, res] = await Promise.all([
    getTranslations('p5.calendar'),
    api<PortalFeedV1>('/portal/feed'),
  ]);
  if (!res.ok) {
    return (
      <>
        <PortalTabs />
        <PortalProblem status={res.status} message={res.message} />
      </>
    );
  }
  const https = await absoluteUrl(res.data.path);
  const webcal = https.replace(/^https?:/, 'webcal:');
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;

  return (
    <>
      <PortalTabs />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <a href={google} target="_blank" rel="noreferrer" className={buttonVariants()}>
          {t('google')}
        </a>
        <a href={webcal} className={buttonVariants({ variant: 'outline' })}>
          {t('phone')}
        </a>
      </div>

      <CopyField
        label={t('address')}
        value={https}
        copyLabel={t('copy')}
        copiedLabel={t('copied')}
      />
      <p className="text-sm text-muted-foreground">{t('privateNote')}</p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('resetTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t('resetBody')}</p>
          <form action={resetFeed}>
            <Button type="submit" variant="outline">
              {t('reset')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
