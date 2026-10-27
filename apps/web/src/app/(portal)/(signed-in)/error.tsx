'use client';

import { Button } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { Problem } from '@/components/problem';

/** Something broke while loading the portal: say so plainly and offer a retry. */
export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('p5.common');
  return (
    <Problem title={t('problemTitle')} body={t('problemBody')}>
      <Button type="button" onClick={reset}>
        {t('tryAgain')}
      </Button>
    </Problem>
  );
}
