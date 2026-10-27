import type { OutgoingMail } from '../../mail/mail.service';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The one-time code email. The code is the subject's first word so phones show it at once. */
export function otpEmail(input: {
  to: string;
  name: string;
  instituteName: string;
  code: string;
  minutes: number;
}): OutgoingMail {
  const intro = `Hello ${input.name}, here is your code to sign in to Slotwise at ${input.instituteName}:`;
  const after = `It works once, for ${input.minutes} minutes. If you didn't ask for it, ignore this email; nobody can sign in without the code.`;
  return {
    to: input.to,
    subject: `${input.code} is your Slotwise sign-in code`,
    text: `${intro}\n\n${input.code}\n\n${after}`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">
      <p>${escapeHtml(intro)}</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px">${input.code}</p>
      <p style="color:#555;font-size:14px">${escapeHtml(after)}</p>
    </div>`,
  };
}
