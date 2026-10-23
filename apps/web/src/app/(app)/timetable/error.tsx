'use client';

import { Button } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { Problem } from '@/components/problem';

/** Something broke while loading a timetable page: say so plainly and offer a retry. */
export default function TimetableError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('p2t.error');
  return (
    <Problem title={t('title')} body={t('body')}>
      <Button type="button" onClick={reset}>
        {t('retry')}
      </Button>
    </Problem>
  );
}
