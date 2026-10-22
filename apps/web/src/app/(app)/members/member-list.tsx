'use client';

import { can, type AuthUser, type InstituteDto, type MemberDto } from '@slotwise/shared';
import { Alert, Badge, Button } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { restoreMembershipAction, revokeMembershipAction } from './actions';

interface Notice {
  text: string;
  undoId?: string;
  error?: boolean;
}

/** Remove is instant and undoable: no confirm dialog (CLAUDE.md "Undo instead of confirm"). */
export function MemberList({
  members,
  user,
  institute,
}: {
  members: MemberDto[];
  user: AuthUser;
  institute: InstituteDto;
}) {
  const t = useTranslations('members');
  const tRoles = useTranslations('roles');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, startTransition] = useTransition();

  const canRemove = (m: MemberDto) =>
    m.user.id !== user.id &&
    can(user, 'member.revoke', {
      type: 'membership',
      instituteId: institute.id,
      universityId: institute.parentUniversityId,
      departmentId: m.scope.type === 'department' ? m.scope.id : null,
      role: m.role,
    });

  function remove(m: MemberDto) {
    startTransition(async () => {
      const res = await revokeMembershipAction(m.membershipId);
      const name = m.user.name ?? m.user.email;
      setNotice(
        res.ok
          ? { text: t('removed', { name, role: tRoles(m.role) }), undoId: m.membershipId }
          : { text: res.message ?? '', error: true },
      );
    });
  }

  function undo(id: string) {
    startTransition(async () => {
      const res = await restoreMembershipAction(id);
      setNotice(res.ok ? { text: t('restored') } : { text: res.message ?? '', error: true });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite">
        {notice ? (
          <Alert
            variant={notice.error ? 'destructive' : 'default'}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>{notice.text}</span>
            {notice.undoId ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => undo(notice.undoId!)}
              >
                {t('undo')}
              </Button>
            ) : null}
          </Alert>
        ) : null}
      </div>

      {members.length === 0 ? <p className="text-muted-foreground">{t('empty')}</p> : null}
      <ul className="flex flex-col divide-y rounded-xl border">
        {members.map((m) => {
          const name = m.user.name ?? m.user.email;
          return (
            <li key={m.membershipId} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {name}
                  {m.user.id === user.id ? (
                    <span className="text-muted-foreground"> ({t('you')})</span>
                  ) : null}
                </p>
                <p className="truncate text-sm text-muted-foreground">{m.user.email}</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  <Badge>{tRoles(m.role)}</Badge>
                  <Badge className="bg-transparent">{m.scope.name}</Badge>
                </p>
              </div>
              {canRemove(m) ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => remove(m)}
                  aria-label={t('removeLabel', { name, role: tRoles(m.role) })}
                >
                  {t('remove')}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
