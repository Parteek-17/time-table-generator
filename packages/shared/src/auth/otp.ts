/**
 * TODO(phase-5): student login with roll number + one-time code (email or phone).
 * Not implemented in Phase 0. The web app will gain an "otp" Auth.js provider that
 * delegates to an implementation of this interface on the API side.
 */
export interface OtpLoginProvider {
  /** Sends a code to the student's registered email or phone. */
  requestCode(input: {
    instituteId: string;
    rollNumber: string;
  }): Promise<{ channel: 'email' | 'phone'; maskedDestination: string }>;

  /** Returns the user id when the code is valid and unexpired, otherwise null. */
  verifyCode(input: {
    instituteId: string;
    rollNumber: string;
    code: string;
  }): Promise<{ userId: string } | null>;
}
