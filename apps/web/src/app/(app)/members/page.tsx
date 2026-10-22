import {
  canSomewhere,
  type AuthUser,
  type DepartmentDto,
  type InviteDto,
  type MeResponse,
  type MemberDto,
} from '@slotwise/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { InviteForm } from './invite-form';
import { MemberList } from './member-list';
import { PendingInvites } from './pending-invites';

export const metadata: Metadata = { title: 'Members' };

export default async function MembersPage() {
  const session = await auth();
  if (!session?.user) redirect('/sign-in?callbackUrl=/members');

  const t = await getTranslations('members');
  const me = await api<MeResponse>('/me');
  if (!me.ok) redirect('/');

  const { institute, grants } = me.data;
  const user: AuthUser = { id: me.data.user.id, memberships: grants };
  const place = { id: institute.id, parentUniversityId: institute.parentUniversityId };
  if (!canSomewhere(user, 'member.view', place)) {
    return <Problem title={t('title')} body={t('noPermission')} />;
  }

  const canInvite = canSomewhere(user, 'member.invite', place);
  const [members, invites, departments] = await Promise.all([
    api<MemberDto[]>('/members'),
    canInvite ? api<InviteDto[]>('/invites') : Promise.resolve(null),
    api<DepartmentDto[]>('/departments'),
  ]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle', { institute: institute.name })}</p>
      </div>

      {canInvite ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('inviteTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteForm
              user={user}
              institute={institute}
              departments={departments.ok ? departments.data : []}
            />
          </CardContent>
        </Card>
      ) : null}

      {invites?.ok ? <PendingInvites invites={invites.data} /> : null}

      <section className="flex flex-col gap-3" aria-labelledby="people-heading">
        <h2 id="people-heading" className="text-lg font-semibold">
          {t('listTitle', { count: members.ok ? members.data.length : 0 })}
        </h2>
        {members.ok ? (
          <MemberList members={members.data} user={user} institute={institute} />
        ) : (
          <Problem title={members.message} />
        )}
      </section>
    </>
  );
}
