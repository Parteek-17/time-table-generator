import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth, { type DefaultSession } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import { createTransport } from 'nodemailer';
import { env, googleSignInEnabled } from './lib/env';
import { prisma } from './lib/prisma';

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}

/** Provider id used by the email sign-in form. */
export const EMAIL_PROVIDER = 'nodemailer';

// Lazy config: env and the database are only touched when a request needs them.
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const providers: Provider[] = [
    Nodemailer({
      server: env().EMAIL_SERVER,
      from: env().EMAIL_FROM,
      maxAge: 24 * 60 * 60,
      async sendVerificationRequest({ identifier, url, provider }) {
        const host = new URL(url).host;
        await createTransport(provider.server).sendMail({
          to: identifier,
          from: provider.from,
          subject: `Your sign-in link for ${host}`,
          text: `Open this link to sign in to Slotwise:\n${url}\n\nIt works once, for 24 hours. If you didn't ask for it, ignore this email.`,
          html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">
            <p>Open this link to sign in to Slotwise (${host}):</p>
            <p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none">Sign in</a></p>
            <p style="color:#555;font-size:14px">It works once, for 24 hours. If you didn't ask for it, ignore this email.</p>
          </div>`,
        });
      },
    }),
  ];
  if (googleSignInEnabled()) {
    // Google verifies email addresses, so linking to an existing user with the same
    // email is safe (and is what admins expect after inviting someone).
    providers.push(Google({ allowDangerousEmailAccountLinking: true }));
  }

  return {
    // @auth/prisma-adapter's types target @prisma/client generally; ours is the same client.
    adapter: PrismaAdapter(prisma()),
    providers,
    // Stay signed in for about a semester; each visit (at most once a day) restarts the count.
    session: { strategy: 'database', maxAge: 180 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
    trustHost: true,
    pages: { signIn: '/sign-in', verifyRequest: '/check-email', error: '/sign-in' },
    callbacks: {
      session({ session, user }) {
        session.user.id = user.id;
        return session;
      },
    },
  };
});
