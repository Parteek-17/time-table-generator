'use server';

import { randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { DEMO_ACCOUNTS, demoLoginsEnabled } from '@/lib/demo-logins';
import { prisma } from '@/lib/prisma';

const DAY = 24 * 60 * 60 * 1000;

/** Signs in as one demo account: the same database session the email link would create. */
export async function demoSignIn(formData: FormData): Promise<void> {
  if (!demoLoginsEnabled()) notFound();
  const email = String(formData.get('email') ?? '');
  if (!DEMO_ACCOUNTS.some((a) => a.email === email)) notFound();

  const user = await prisma().user.findUnique({ where: { email } });
  if (!user) redirect('/demo-login?missing=1');

  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + DAY);
  await prisma().session.create({ data: { sessionToken, userId: user.id, expires } });

  // Auth.js's cookie name: the __Secure- prefix is used on HTTPS.
  const secure = (await headers()).get('x-forwarded-proto') === 'https';
  (await cookies()).set(`${secure ? '__Secure-' : ''}authjs.session-token`, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    expires,
  });
  redirect(email.startsWith('platform.') ? '/platform' : '/');
}
