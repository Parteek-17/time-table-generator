/**
 * Student sign-in with roll number + one-time code (CLAUDE.md "Access and login": no
 * passwords). The API owns the codes (apps/api/src/auth/otp); the web app turns a verified
 * code into an Auth.js session (docs/adr/0070-student-one-time-code-sign-in.md).
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const OTP_RULES = {
  /** Digits in a code. */
  digits: 6,
  /** A code works for this long. */
  ttlMinutes: 10,
  /** Wrong tries before a code stops working. */
  maxAttempts: 5,
  /** Codes a student may ask for per window. */
  maxSends: 3,
  windowMinutes: 15,
  /** Lifetime of the single-use Auth.js token made from a verified code. */
  ticketSeconds: 120,
} as const;

/** Class roll number or university roll number, as printed on the ID card. */
export const RollNumber = z
  .string()
  .trim()
  .min(1, 'Enter your roll number.')
  .max(40, 'That roll number is too long.');

export const OtpRequestBody = z.object({ rollNumber: RollNumber });
export type OtpRequestBody = z.infer<typeof OtpRequestBody>;

export const OtpRequestResult = z.object({
  /** Where the code went, partly hidden, e.g. "a•••a@example.com". */
  maskedEmail: z.string(),
  /** Minutes the code works. */
  expiresInMinutes: z.int(),
});
export type OtpRequestResult = z.infer<typeof OtpRequestResult>;

export const OtpVerifyBody = z.object({
  rollNumber: RollNumber,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from the email.'),
});
export type OtpVerifyBody = z.infer<typeof OtpVerifyBody>;

export const OtpVerifyResult = z.object({
  /** The student's sign-in email (lower case); a login with it now exists here. */
  email: z.email(),
});
export type OtpVerifyResult = z.infer<typeof OtpVerifyResult>;

export const OTP_REQUEST_ROUTE = '/auth/otp/request' as const;
export const OTP_VERIFY_ROUTE = '/auth/otp/verify' as const;

/** "asha.verma@example.com" → "a••••••••a@example.com". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  const name = email.slice(0, at);
  const hidden =
    name.length <= 2 ? `${name[0]}•` : `${name[0]}${'•'.repeat(name.length - 2)}${name.at(-1)}`;
  return `${hidden}${email.slice(at)}`;
}

/** Stored form of a code: never the code itself. */
export function hashCode(code: string, pepper: string): string {
  return createHash('sha256').update(`${code}:${pepper}`).digest('hex');
}

/** Constant-time comparison of a typed code with a stored hash. */
export function codeMatches(code: string, storedHash: string, pepper: string): boolean {
  const a = Buffer.from(hashCode(code, pepper), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The token hash Auth.js's email provider looks up in `verification_tokens`:
 * sha256(token + secret) in hex (@auth/core lib/actions/callback, `createHash`). Used to hand
 * a verified student to the existing email callback with a single-use random token.
 */
export function authJsTokenHash(token: string, secret: string): string {
  return createHash('sha256').update(`${token}${secret}`).digest('hex');
}
