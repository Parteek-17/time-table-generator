import { canSomewhere, type MeResponse } from '@slotwise/shared';
import { Alert, Button, Card, CardDescription, CardHeader, CardTitle } from '@slotwise/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { PageShell } from '@/components/page-shell';
import { Problem } from '@/components/problem';
import { api, getInstituteSlug } from '@/lib/api';
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
    const problem =
      me.status === 403
        ? {
            title: tProblems('noAccessTitle', { institute: slug }),
            body: tProblems('noAccessBody'),
          }
        : me.status === 404
          ? { title: tProblems('notFoundTitle'), body: tProblems('notFoundBody') }
          : { title: tProblems('unavailableTitle'), body: me.message };
    return (
      <PageShell email={session.user.email}>
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
  const canManageMembers = canSomewhere({ id: user.id, memberships: grants }, 'member.view', {
    id: institute.id,
    parentUniversityId: institute.parentUniversityId,
  });

  return (
    <PageShell instituteName={institute.name} email={user.email}>
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
    </PageShell>
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
