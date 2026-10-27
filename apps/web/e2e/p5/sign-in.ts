/** Signing in for P5's browser tests: the email link, read from Mailpit's API. */
import { expect, type Page } from '@playwright/test';

export const STUDENT = 'student@demo.slotwise.test';
export const TEACHER = 'faculty@demo.slotwise.test';
export const ADMIN = 'admin@demo.slotwise.test';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';

type MailpitList = { messages: { ID: string; Created: string }[] };

/** Signs in with the email link, read from Mailpit's API. */
export async function signIn(page: Page, email: string): Promise<void> {
  const since = Date.now();
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();

  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        );
        const latest = ((await res.json()) as MailpitList).messages[0];
        if (!latest || Date.parse(latest.Created) < since - 1000) return false;
        const message = (await (await fetch(`${MAILPIT}/api/v1/message/${latest.ID}`)).json()) as {
          Text: string;
        };
        link = /https?:\/\/\S+\/api\/auth\/callback\/\S+/.exec(message.Text)?.[0];
        return Boolean(link);
      },
      { message: 'sign-in email in Mailpit', timeout: 30_000 },
    )
    .toBe(true);
  await page.goto(link!);
}
