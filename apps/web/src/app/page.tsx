import {
  canSomewhere,
  isFlagOn,
  type Action,
  type InstituteDto,
  type MeResponse,
  type SetupStateDto,
} from '@slotwise/shared';
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ProgressBar,
} from '@slotwise/ui';
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
  // can't edit timetables, run imports, manage exams or manage members.
  const readsOnly =
    !canManageMembers &&
    !canSomewhere(authUser, 'timetable.edit', place) &&
    !canSomewhere(authUser, 'import.run', place) &&
    !canSomewhere(authUser, 'exam.manage', place);
  if (isFlagOn('P5') && !joined && readsOnly) redirect('/today');
  const shellMe = await getMe();
  const may = (action: Action) => canSomewhere(authUser, action, place);
  const setupRes = canSetUp ? await api<SetupStateDto>('/setup') : null;
  const setup = setupRes?.ok ? setupRes.data : null;
  // One card per area this person may use, in the order a term's work happens.
  const tasks = (
    [
      ['setup', '/setup', canSetUp],
      ['imports', '/imports', may('import.run')],
      ['readiness', '/readiness', may('readiness.view')],
      ['generate', '/timetable/generate', may('timetable.edit')],
      ['timetables', '/timetable', may('timetable.view')],
      ['reschedule', '/reschedule', isFlagOn('P4') && may('timetable.edit')],
      ['exams', '/exams', isFlagOn('P6') && may('exam.view')],
      ['members', '/members', canManageMembers],
      ['today', '/today', isFlagOn('P5')],
    ] as const
  )
    .filter(([, , show]) => show)
    .map(([key, href]) => ({ key, href }));

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

      {setup ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('attentionTitle')}</CardTitle>
            <CardDescription>
              {setup.attention.length
                ? t('attentionSome', { count: setup.attention.reduce((n, a) => n + a.count, 0) })
                : t('attentionNone')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Link href="/setup" className="text-sm font-medium">
                {t('setupPercent', { percent: setup.percent })}
              </Link>
              <ProgressBar
                value={setup.percent}
                label={t('setupPercent', { percent: setup.percent })}
              />
            </div>
            {setup.attention.length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {setup.attention.map((a) => (
                  <li key={a.code}>
                    <Link href={a.href} className="text-primary underline underline-offset-4">
                      {t(`attention.${a.code}`, { count: a.count })}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="tasks-heading" className="flex flex-col gap-3">
        <h2 id="tasks-heading" className="text-lg font-semibold">
          {t('tasksTitle')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <li key={task.href}>
              <Link
                href={task.href}
                className="flex h-full flex-col gap-1 rounded-lg border p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-semibold">{t(`tasks.${task.key}.title`)}</span>
                <span className="text-sm text-muted-foreground">{t(`tasks.${task.key}.hint`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
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
