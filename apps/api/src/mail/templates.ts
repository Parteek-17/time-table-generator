import type { Role } from '@slotwise/shared';
import type { OutgoingMail } from './mail.service';

// TODO(i18n): move to shared message files when Hindi and Punjabi arrive.
const ROLE_LABELS: Record<Role, string> = {
  platform_admin: 'Platform admin',
  university_admin: 'University admin',
  institute_admin: 'Institute admin',
  hod: 'Head of department',
  timetable_coordinator: 'Timetable coordinator',
  exam_coordinator: 'Exam coordinator',
  faculty: 'Faculty',
  student: 'Student',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function inviteEmail(input: {
  to: string;
  inviterName: string;
  instituteName: string;
  role: Role;
  scopeName: string;
  acceptUrl: string;
  expiresAt: Date;
}): OutgoingMail {
  const role = ROLE_LABELS[input.role];
  const where =
    input.scopeName === input.instituteName
      ? input.instituteName
      : `${input.scopeName}, ${input.instituteName}`;
  const expires = input.expiresAt.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const subject = `You're invited to ${input.instituteName} on Slotwise`;
  const text = [
    `${input.inviterName} invited you to join ${input.instituteName} as ${role} (${where}).`,
    '',
    `Accept the invite: ${input.acceptUrl}`,
    '',
    `This link works until ${expires}. If you weren't expecting it, you can ignore this email.`,
  ].join('\n');
  const html = `
    <div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#111">
      <p>${escapeHtml(input.inviterName)} invited you to join <strong>${escapeHtml(input.instituteName)}</strong>
         as <strong>${escapeHtml(role)}</strong> (${escapeHtml(where)}).</p>
      <p><a href="${escapeHtml(input.acceptUrl)}"
            style="display:inline-block;padding:12px 20px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none">
         Accept invite</a></p>
      <p style="color:#555;font-size:14px">This link works until ${escapeHtml(expires)}.
         If you weren't expecting it, you can ignore this email.</p>
    </div>`;
  return { to: input.to, subject, text, html };
}
