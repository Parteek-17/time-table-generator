'use client';

import { INSTITUTE_TYPES, type InstituteProfileDto } from '@slotwise/shared';
import { Card, CardContent } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { EntityForm } from '@/components/entity/entity-form';

/** Common Indian and nearby time zones first; any IANA name can be typed. */
const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Asia/Dhaka',
  'Asia/Colombo',
  'Asia/Dubai',
  'UTC',
];

export function InstituteForm({
  profile,
  canEdit,
}: {
  profile: InstituteProfileDto;
  canEdit: boolean;
}) {
  const t = useTranslations('institute');
  const tEnum = useTranslations('enums');
  if (!canEdit) {
    return (
      <Card>
        <CardContent className="pt-4 sm:pt-6">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">{t('name')}</dt>
              <dd>{profile.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('affiliation')}</dt>
              <dd>{profile.affiliatingUniversityName ?? '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="pt-4 sm:pt-6">
        <EntityForm
          path="/institute"
          id="profile"
          revalidate="/settings/institute"
          initial={profile as unknown as Record<string, unknown>}
          submitLabel={t('save')}
          resetOnCreate={false}
          fields={[
            { name: 'name', label: t('name'), type: 'text' },
            {
              name: 'type',
              label: t('type'),
              type: 'select',
              half: true,
              options: INSTITUTE_TYPES.map((v) => ({
                value: v,
                label: tEnum(`instituteType.${v}`),
              })),
            },
            {
              name: 'timezone',
              label: t('timezone'),
              type: 'select',
              half: true,
              options: [...new Set([profile.timezone, ...TIMEZONES])].map((z) => ({
                value: z,
                label: z,
              })),
            },
            {
              name: 'affiliatingUniversityName',
              label: t('affiliation'),
              hint: t('affiliationHint'),
              type: 'text',
              optional: true,
            },
          ]}
        />
        <p className="mt-4 text-sm text-muted-foreground">{t('logoLater')}</p>
      </CardContent>
    </Card>
  );
}
