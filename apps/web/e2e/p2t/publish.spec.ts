/**
 * Timetable happy path (milestone 2T-e): a coordinator generates a draft, moves a class,
 * publishes at phone width, undoes it (the changes come back as a draft), publishes again,
 * then downloads Excel and PDF and copies the week as CSV.
 *
 * Moving classes needs a tablet or computer (the phone view only shows the week), so that one
 * step runs at desktop width. The API's mock solver (SOLVER_SOURCE=mock, the default) keeps
 * generating to a few seconds.
 */
import { expect, test, type Page } from '@playwright/test';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const ADMIN = 'admin@demo.slotwise.test';
const PHONE = { width: 400, height: 850 };

type MailpitList = { messages: { ID: string; Created: string }[] };

/**
 * Signs in with the email link, read from Mailpit's API (as P1's test). Other streams' tests
 * may sign the same admin in at the same time, so only a link to this server counts.
 */
async function signIn(page: Page, email: string): Promise<void> {
  const since = Date.now();
  await page.goto('/sign-in');
  const origin = new URL(page.url()).origin;
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();

  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        );
        const recent = ((await res.json()) as MailpitList).messages.filter(
          (m) => Date.parse(m.Created) >= since - 1000,
        );
        for (const m of recent) {
          const message = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
            Text: string;
          };
          link = /https?:\/\/\S+\/api\/auth\/callback\/\S+/
            .exec(message.Text)?.[0]
            ?.replace(/^.*?(?=https?:)/, '');
          if (link?.startsWith(`${origin}/`)) return true;
        }
        return false;
      },
      { message: 'sign-in email in Mailpit', timeout: 30_000 },
    )
    .toBe(true);
  await page.goto(link!);
}

test('generate, move a class, publish, undo, publish again, download', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await signIn(page, ADMIN);

  // Generate a draft.
  await page.goto('/timetable/generate');
  await page.getByLabel('How long to search').selectOption('30');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByText('Draft ready')).toBeVisible({ timeout: 120_000 });
  await page.getByRole('link', { name: 'Open the draft' }).click();
  await expect(page).toHaveURL(/version=/);
  await expect(page.getByText('This is a draft.')).toBeVisible();

  // Move one class (desktop width: the editing grid).
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole('button', { name: /^Move / })
    .first()
    .click();
  await page.getByRole('heading', { name: /to…$/ }).waitFor();
  await page
    .getByRole('button', { name: /^(Mon|Tue|Wed|Thu|Fri|Sat) P\d/ })
    .first()
    .click();
  await expect(page.getByText(/^Moved /)).toBeVisible();
  await page.setViewportSize(PHONE);

  // Publish at phone width: no confirm, Undo instead.
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const published = page.getByText(/^Published as version \d+\./);
  await expect(published).toBeVisible();
  await expect(page).toHaveURL(/notice=published/);
  const firstNumber = Number(/version (\d+)/.exec((await published.textContent()) ?? '')?.[1]);

  await page.getByRole('button', { name: 'Undo publishing' }).click();
  await expect(page.getByText(/^Publishing undone\./)).toBeVisible();
  await expect(page.getByText('This is a draft.')).toBeVisible();

  // The draft copy keeps the move; publish it for real.
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(`Published as version ${firstNumber + 1}.`)).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page).not.toHaveURL(/notice=/);

  // Downloads of the section on screen.
  const excel = page.waitForEvent('download');
  await page
    .getByRole('button', { name: /as Excel$/ })
    .first()
    .click();
  expect((await excel).suggestedFilename()).toMatch(/^timetable-.+-v\d+\.xlsx$/);

  const pdf = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('button', { name: /as PDF$/ }).click();
  expect((await pdf).suggestedFilename()).toMatch(/^timetable-.+-v\d+\.pdf$/);

  await page.getByRole('button', { name: /as CSV/ }).click();
  await expect(page.getByText(/^Copied\./)).toBeVisible();
  const csv = await page.evaluate(() => navigator.clipboard.readText());
  expect(csv.split('\r\n')[0]).toMatch(/^Day,P1 /);
  expect(csv.split('\r\n')[1]).toMatch(/^Monday,/);
});
