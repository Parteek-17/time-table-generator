/**
 * Email layouts for notifications (notify.v1 `templateKey`). Plain words, short, readable on a
 * phone. Templates are namespaced by the stream that asks: `p4.*` here; other streams add
 * theirs through a request to P4.
 */
import type { OutgoingMail } from '../mail/mail.service';

// TODO(i18n): move to shared message files when Hindi and Punjabi arrive.

export type TemplateData = Record<string, string | number | boolean | null>;

interface Rendered {
  subject: string;
  lines: string[];
  /** Link to the page with the details, and its label. */
  link?: { url: string; label: string };
}

type Template = (data: TemplateData) => Rendered | null;

const str = (data: TemplateData, key: string): string | null => {
  const v = data[key];
  return typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : null;
};

const TEMPLATES: Record<string, Template> = {
  /** A holiday, event or leave cancelled classes. data: title, dates, count, url. */
  'p4.classesCancelled': (d) => {
    const title = str(d, 'title');
    const dates = str(d, 'dates');
    const count = Number(d.count ?? 0);
    if (!title || !dates || count < 1) return null;
    return {
      subject: `Classes cancelled: ${title}, ${dates}`,
      lines: [
        `${title} (${dates}): ${count === 1 ? '1 class is' : `${count} classes are`} cancelled.`,
        'Make-up classes will be announced separately.',
      ],
      link: str(d, 'url') ? { url: str(d, 'url')!, label: 'See what changed' } : undefined,
    };
  },
  /** One class cancelled by hand. data: course, group, date, time, reason, url. */
  'p4.classCancelled': (d) => {
    const course = str(d, 'course');
    const date = str(d, 'date');
    const time = str(d, 'time');
    if (!course || !date || !time) return null;
    const group = str(d, 'group');
    const reason = str(d, 'reason');
    return {
      subject: `Class cancelled: ${course}, ${date}`,
      lines: [
        `${course}${group ? ` for ${group}` : ''} on ${date}, ${time}, is cancelled.`,
        ...(reason ? [`Reason: ${reason}.`] : []),
        'A make-up class will be announced separately.',
      ],
      link: str(d, 'url') ? { url: str(d, 'url')!, label: 'See what changed' } : undefined,
    };
  },
  /** A make-up class was booked. data: course, group, date, time, room, url. */
  'p4.makeUpBooked': (d) => {
    const course = str(d, 'course');
    const date = str(d, 'date');
    const time = str(d, 'time');
    const room = str(d, 'room');
    if (!course || !date || !time || !room) return null;
    const group = str(d, 'group');
    return {
      subject: `Make-up class: ${course}, ${date}`,
      lines: [
        `Make-up class for ${course}${group ? ` (${group})` : ''}: ${date}, ${time}, room ${room}.`,
        ...(str(d, 'replaces')
          ? [`It replaces the class cancelled on ${str(d, 'replaces')}.`]
          : []),
      ],
      link: str(d, 'url') ? { url: str(d, 'url')!, label: 'See your timetable' } : undefined,
    };
  },
};

export function hasTemplate(key: string): boolean {
  return key in TEMPLATES;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The email for one person, or null when the template is unknown or its data incomplete. */
export function renderEmail(
  templateKey: string,
  data: TemplateData,
  to: { email: string; name: string },
  instituteName: string,
): OutgoingMail | null {
  const rendered = TEMPLATES[templateKey]?.(data);
  if (!rendered) return null;
  const greeting = to.name.trim() ? `Hello ${to.name.trim()},` : 'Hello,';
  const footer = `${instituteName} · sent by Slotwise`;
  const text = [
    greeting,
    '',
    ...rendered.lines,
    ...(rendered.link ? ['', `${rendered.link.label}: ${rendered.link.url}`] : []),
    '',
    footer,
  ].join('\n');
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    ...rendered.lines.map((l) => `<p>${escapeHtml(l)}</p>`),
    rendered.link
      ? `<p><a href="${escapeHtml(rendered.link.url)}">${escapeHtml(rendered.link.label)}</a></p>`
      : '',
    `<p style="color:#666;font-size:12px">${escapeHtml(footer)}</p>`,
  ].join('\n');
  return { to: to.email, subject: rendered.subject, text, html };
}
