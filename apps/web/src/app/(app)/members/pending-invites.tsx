'use client';

import type { InviteDto } from '@slotwise/shared';
import { Alert, Badge, Button } from '@slotwise/ui';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { cancelInviteAction } from './actions';

export function PendingInvites({ invites }: { invites: InviteDto[] }) {
  const t = useTranslations('members');
  const tRoles = useTranslations('roles');
  const format = useFormatter();
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  if (invites.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('pendingTitle', { count: invites.length })}</h2>
      <div aria-live="polite">
        {message ? (
          <Alert variant={message.error ? 'destructive' : 'default'}>{message.text}</Alert>
        ) : null}
      </div>
      <ul className="flex flex-col divide-y rounded-xl border">
        {invites.map((invite) => (
          <li key={invite.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{invite.email}</p>
              <p className="mt-1 flex flex-wrap gap-1">
                <Badge>{tRoles(invite.role)}</Badge>
                <Badge className="bg-transparent">{invite.scope.name}</Badge>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('expires', {
                  date: format.dateTime(new Date(invite.expiresAt), { dateStyle: 'medium' }),
                })}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              aria-label={t('cancelLabel', { email: invite.email })}
              onClick={() =>
                startTransition(async () => {
                  const res = await cancelInviteAction(invite.id);
                  setMessage(
                    res.ok ? { text: t('cancelled') } : { text: res.message ?? '', error: true },
                  );
                })
              }
            >
              {t('cancel')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
