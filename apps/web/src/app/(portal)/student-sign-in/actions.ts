'use server';

import { randomBytes } from 'node:crypto';
import {
  authJsTokenHash,
  OTP_REQUEST_ROUTE,
  OTP_RULES,
  OTP_VERIFY_ROUTE,
  OtpRequestBody,
  OtpVerifyBody,
  type OtpRequestResult,
  type OtpVerifyResult,
} from '@slotwise/shared/portal';
import { redirect } from 'next/navigation';
import { EMAIL_PROVIDER } from '@/auth';
import { api } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export interface StudentSignInState {
  step: 'roll' | 'code';
  rollNumber?: string;
  maskedEmail?: string;
  /** Plain-language problem from the API or the form check. */
  error?: string;
  /** True right after a new code was sent (for the "sent again" note). */
  resent?: boolean;
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Please check what you typed.';
}

/** Step 1 (and "send a new code"): email a code to the student's record. */
async function sendCode(rollNumber: unknown, resent: boolean): Promise<StudentSignInState> {
  const body = OtpRequestBody.safeParse({ rollNumber });
  if (!body.success) {
    return { step: 'roll', rollNumber: String(rollNumber ?? ''), error: firstIssue(body.error) };
  }
  const res = await api<OtpRequestResult>(OTP_REQUEST_ROUTE, { method: 'POST', body: body.data });
  if (!res.ok) return { step: 'roll', rollNumber: body.data.rollNumber, error: res.message };
  return {
    step: 'code',
    rollNumber: body.data.rollNumber,
    maskedEmail: res.data.maskedEmail,
    resent,
  };
}

/**
 * Hands a verified student to Auth.js: a random single-use token stored the way its email
 * provider stores sign-in links, then its own callback creates the session (ADR 0070).
 */
async function startSession(email: string): Promise<never> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set');
  const token = randomBytes(32).toString('hex');
  await prisma().verificationToken.create({
    data: {
      identifier: email,
      token: authJsTokenHash(token, secret),
      expires: new Date(Date.now() + OTP_RULES.ticketSeconds * 1000),
    },
  });
  redirect(
    `/api/auth/callback/${EMAIL_PROVIDER}?${new URLSearchParams({
      callbackUrl: '/today',
      token,
      email,
    })}`,
  );
}

export async function studentSignIn(
  prev: StudentSignInState,
  form: FormData,
): Promise<StudentSignInState> {
  if (form.get('intent') === 'send') return sendCode(form.get('rollNumber'), false);
  if (form.get('intent') === 'resend') return sendCode(prev.rollNumber, true);
  if (form.get('intent') === 'restart') return { step: 'roll', rollNumber: prev.rollNumber };

  const body = OtpVerifyBody.safeParse({ rollNumber: prev.rollNumber, code: form.get('code') });
  if (!body.success) return { ...prev, resent: false, error: firstIssue(body.error) };
  const res = await api<OtpVerifyResult>(OTP_VERIFY_ROUTE, { method: 'POST', body: body.data });
  if (!res.ok) return { ...prev, resent: false, error: res.message };
  return startSession(res.data.email);
}
