import type { InvitePreviewDto } from '@slotwise/shared';
import { Button, Card, CardContent, CardDescription, CardHeader } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { auth } from '@/auth';
import { signOutAction } from '@/app/actions';
import { PageShell } from '@/components/page-shell';
import { Problem } from '@/components/problem';
import { SignInForm } from '@/components/sign-in-form';
import { api } from '@/lib/api';
import { googleSignInEnabled } from '@/lib/env';
import { AcceptForm } from './accept-form';

export const metadata: Metadata = { title: 'Invite' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [t, tRoles, tCommon, session] = await Promise.all([
    getTranslations('invite'),
    getTranslations('roles'),
    getTranslations('common'),
    auth(),
  ]);
  const email = session?.user?.email ?? null;
  const preview = await api<InvitePreviewDto>(`/invites/token/${encodeURIComponent(token)}`);

  if (!preview.ok) {
    return (
      <PageShell email={email}>
        <Problem title={t('invalid')} />
      </PageShell>
    );
  }

  const invite = preview.data;
  if (invite.status !== 'pending') {
    return (
      <PageShell instituteName={invite.instituteName} email={email}>
        <Problem title={t(invite.status)}>
          <Button asChild variant="outline">
            <Link href="/">{tCommon('goHome')}</Link>
          </Button>
        </Problem>
      </PageShell>
    );
  }

  const here = `/invite/${token}`;
  const signedInAsInvitee = email?.toLowerCase() === invite.email;

  return (
    <PageShell instituteName={invite.instituteName} email={email}>
      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <CardDescription className="text-base">
            {t('body', {
              institute: invite.instituteName,
              role: tRoles(invite.role),
              scope: invite.scope.name,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!email ? (
            <>
              <p>{t('signInToAccept', { email: invite.email })}</p>
              <SignInForm
                redirectTo={here}
                defaultEmail={invite.email}
                googleEnabled={googleSignInEnabled()}
              />
            </>
          ) : signedInAsInvitee ? (
            <AcceptForm token={token} />
          ) : (
            <>
              <p>{t('wrongAccount', { invited: invite.email, current: email })}</p>
              <form action={signOutAction}>
                <Button type="submit" variant="outline">
                  {tCommon('signOut')}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
