import { describe, expect, it } from 'vitest';
import { hasTemplate, renderEmail } from './templates';

const to = { email: 'student@demo.slotwise.test', name: 'Asha' };

describe('notification emails', () => {
  it('writes a holiday notice in plain words with a link', () => {
    const mail = renderEmail(
      'p4.classesCancelled',
      {
        title: 'Annual fest',
        dates: 'Thu, 29 Oct',
        count: 6,
        url: 'http://demo.localhost:3000/reschedule',
      },
      to,
      'Demo Institute of Engineering',
    )!;
    expect(mail.to).toBe(to.email);
    expect(mail.subject).toBe('Classes cancelled: Annual fest, Thu, 29 Oct');
    expect(mail.text).toContain('Hello Asha,');
    expect(mail.text).toContain('Annual fest (Thu, 29 Oct): 6 classes are cancelled.');
    expect(mail.text).toContain('See what changed: http://demo.localhost:3000/reschedule');
    expect(mail.text).toContain('Demo Institute of Engineering · sent by Slotwise');
  });

  it('says where and when the make-up is, and escapes HTML', () => {
    const mail = renderEmail(
      'p4.makeUpBooked',
      {
        course: 'CS301 <DS>',
        group: 'CS B',
        date: 'Fri, 30 Oct',
        time: '10:30–11:30',
        room: 'G12',
        replaces: 'Wed, 28 Oct',
      },
      { email: to.email, name: '' },
      'Demo',
    )!;
    expect(mail.text).toContain('Hello,');
    expect(mail.text).toContain(
      'Make-up class for CS301 <DS> (CS B): Fri, 30 Oct, 10:30–11:30, room G12.',
    );
    expect(mail.text).toContain('It replaces the class cancelled on Wed, 28 Oct.');
    expect(mail.html).toContain('CS301 &#60;DS&#62;');
    expect(mail.html).not.toContain('<DS>');
  });

  it('sends nothing for unknown templates or missing data', () => {
    expect(hasTemplate('p4.classCancelled')).toBe(true);
    expect(hasTemplate('p6.seatNotice')).toBe(false);
    expect(renderEmail('p6.seatNotice', {}, to, 'Demo')).toBeNull();
    expect(renderEmail('p4.classCancelled', { course: 'CS301 DS' }, to, 'Demo')).toBeNull();
    expect(
      renderEmail('p4.classesCancelled', { title: 'Fest', dates: 'Thu', count: 0 }, to, 'Demo'),
    ).toBeNull();
  });
});
