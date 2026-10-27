import { describe, expect, it } from 'vitest';
import { authJsTokenHash, codeMatches, hashCode, maskEmail, OtpVerifyBody } from './otp';

describe('one-time codes', () => {
  it('hides most of the email address', () => {
    expect(maskEmail('asha.verma@example.com')).toBe('a••••••••a@example.com');
    expect(maskEmail('ab@example.com')).toBe('a•@example.com');
    expect(maskEmail('nope')).toBe('•••');
  });

  it('stores a hash and compares in constant time', () => {
    const stored = hashCode('123456', 'pepper');
    expect(stored).not.toContain('123456');
    expect(codeMatches('123456', stored, 'pepper')).toBe(true);
    expect(codeMatches('123457', stored, 'pepper')).toBe(false);
    expect(codeMatches('123456', stored, 'other')).toBe(false);
  });

  it('accepts only six digits, spaces trimmed', () => {
    expect(OtpVerifyBody.safeParse({ rollNumber: ' 2315179 ', code: ' 042137 ' }).success).toBe(
      true,
    );
    expect(OtpVerifyBody.safeParse({ rollNumber: '1', code: '12345' }).success).toBe(false);
    expect(OtpVerifyBody.safeParse({ rollNumber: '', code: '123456' }).success).toBe(false);
  });

  it('hashes tokens the way Auth.js looks them up (WebCrypto SHA-256 of token + secret)', async () => {
    const data = new TextEncoder().encode('ticketsecret');
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(authJsTokenHash('ticket', 'secret')).toBe(hex);
  });
});
