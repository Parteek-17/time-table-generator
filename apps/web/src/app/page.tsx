import { canSomewhere, isFlagOn, type InstituteDto, type MeResponse } from '@slotwise/shared';
import { Alert, Button, Card, CardDescription, CardHeader, CardTitle } from '@slotwise/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AppShell } from '@/components/app-shell';
import { PageShell } from '@/components/page-shell';
import { Problem } from '@/components/problem';
import { api, getInstituteSlug } from '@/lib/api';
import { getMe } from '@/lib/me';
import { describeMembership } from '@/lib/labels';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string }>;
}) {
  const slug = await getInstituteSlug();
  if (!slug) return <Landing />;

  const session = await auth();
  if (!session?.user) redirect('/sign-in');

  const [t, tRoles, tCommon, tProblems] = await Promise.all([
    getTranslations('home'),
    getTranslations('roles'),
    getTranslations('common'),
    getTranslations('problems'),
  ]);
  const me = await api<MeResponse>('/me');

  if (!me.ok) {
    const publicInfo = me.status === 403 ? await api<InstituteDto>('/institute') : null;
    const instituteName = publicInfo?.ok ? publicInfo.data.name : slug;
    const problem =
      me.status === 403
        ? {
            title: tProblems('noAccessTitle', { institute: instituteName }),
            body: tProblems('noAccessBody'),
          }
        : me.status === 404
          ? { title: tProblems('notFoundTitle'), body: tProblems('notFoundBody') }
          : { title: tProblems('unavailableTitle'), body: me.message };
    return (
      <PageShell
        instituteName={publicInfo?.ok ? instituteName : undefined}
        email={session.user.email}
      >
        <Problem title={problem.title} body={problem.body}>
          <p className="text-sm text-muted-foreground">
            {tCommon('signedInAs', { email: session.user.email ?? '' })}
          </p>
        </Problem>
      </PageShell>
    );
  }

  const { user, institute, memberships, grants } = me.data;
  const { joined } = await searchParams;
  const place = { id: institute.id, parentUniversityId: institute.parentUniversityId };
  const authUser = { id: user.id, memberships: grants };
  const canManageMembers = canSomewhere(authUser, 'member.view', place);
  const canSetUp = canSomewhere(authUser, 'masterdata.view', place);
  // Students and teachers land on "Today" (CLAUDE.md "Role-shaped home screens"): anyone who
  // can't edit timetables, run imports or manage members. Add exam permissions here when P6
  // lands, so exam coordinators keep this home screen.
  const readsOnly =
    !canManageMembers &&
    !canSomewhere(authUser, 'timetable.edit', place) &&
    !canSomewhere(authUser, 'import.run', place);
  if (isFlagOn('P5') && !joined && readsOnly) redirect('/today');
  const shellMe = await getMe();

  return (
    <AppShell me={shellMe}>
      {joined ? (
        <Alert variant="success">{t('joined', { institute: institute.name })}</Alert>
      ) : null}

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t('welcome', { name: user.name ?? user.email })}
        </h1>
        <ul className="flex flex-col gap-0.5 text-muted-foreground">
          {memberships.map((m) => (
            <li key={m.id}>{describeMembership(m, institute.name, t, tRoles)}</li>
          ))}
        </ul>
      </div>

      {canSetUp ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('setupTitle')}</CardTitle>
            <CardDescription>{t('setupHint')}</CardDescription>
            <Button asChild className="mt-2 self-start">
              <Link href="/setup">{t('setupOpen')}</Link>
            </Button>
          </CardHeader>
        </Card>
      ) : null}

      {canManageMembers ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('members')}</CardTitle>
            <CardDescription>{t('membersHint')}</CardDescription>
            <Button asChild className="mt-2 self-start">
              <Link href="/members">{t('members')}</Link>
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardDescription className="text-base">{t('timetableSoon')}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </AppShell>
  );
}

async function Landing() {
  const t = await getTranslations('landing');
  const isDev = process.env.NODE_ENV !== 'production';
  return (
    <PageShell>
      <Problem title={t('title')} body={t('body')}>
        {isDev ? (
          <p className="text-sm">
            {t('devHint')}{' '}
            <a className="text-primary underline" href="http://demo.localhost:3000">
              demo.localhost:3000
            </a>
          </p>
        ) : null}
      </Problem>
    </PageShell>
  );
}
