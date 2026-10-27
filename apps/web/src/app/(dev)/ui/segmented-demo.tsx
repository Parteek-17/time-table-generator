'use client';

import { SegmentedControl } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Two segmented controls with state: a view picker and a phone day picker. */
export function SegmentedDemo() {
  const t = useTranslations('ui.gallery.segmented');
  const tDays = useTranslations('ui.days');
  const [kind, setKind] = useState('section');
  const [day, setDay] = useState(1);
  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        label={t('show')}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'section', label: t('section') },
          { value: 'subgroup', label: t('subgroup') },
          { value: 'faculty', label: t('faculty') },
          { value: 'room', label: t('room'), disabled: true },
        ]}
      />
      <SegmentedControl
        label={t('day')}
        size="lg"
        value={day}
        onChange={setDay}
        className="border-0 p-0"
        options={[1, 2, 3, 4, 5].map((d) => ({
          value: d,
          label: tDays(`short.${d}`),
          ariaLabel: tDays(`long.${d}`),
        }))}
      />
    </div>
  );
}
