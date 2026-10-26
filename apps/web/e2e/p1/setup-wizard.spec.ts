/**
 * Setup wizard happy path (milestone 1c), entered by hand: an institute admin walks the ten
 * steps at phone width, adds a department on the way (and archives it again with Undo
 * available), and the overview shows every step done.
 */
import { expect, test, type Page } from '@playwright/test';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const ADMIN = 'admin@demo.slotwise.test';

/** Steps the admin completes in the wizard, in order (steps 11 and 12 come with 1e). */
const STEPS = [
  ['profile', 'Institute profile'],
  ['departments', 'Departments'],
  ['programmes', 'Programmes and branches'],
  ['schemes', 'Schemes and courses'],
  ['term', 'Session and term'],
  ['cohorts', 'Batches and sections'],
  ['faculty', 'Faculty'],
  ['rooms', 'Buildings and rooms'],
  ['bell', 'Bell schedule'],
  ['calendar', 'Calendar'],
] as const;

type MailpitList = { messages: { ID: string; Created: string }[] };

/** Signs in with the email link, read from Mailpit's API. */
async function signIn(page: Page, email: string): Promise<void> {
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

test('an admin walks the setup wizard and the overview shows every step done', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/setup');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Set up your institute' }),
  ).toBeVisible();

  await page.goto(`/setup/${STEPS[0][0]}`);
  for (const [i, [step, title]] of STEPS.entries()) {
    await expect(page).toHaveURL(new RegExp(`/setup/${step}$`));
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(`Step ${i + 1} of 12`)).toBeVisible();

    if (step === 'departments') {
      // Codes are unique per institute, so each run uses its own.
      const code = `E2E-${Date.now().toString(36).toUpperCase()}`;
      await page.getByRole('button', { name: 'Add a department' }).click();
      await page.getByLabel('Code').fill(code);
      await page.getByLabel('Name').fill('Playwright Test Department');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await page.getByRole('button', { name: `Archive ${code}` }).click();
      await expect(page.getByText(`Archived ${code}`)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    }

    await page.getByRole('button', { name: 'Save and continue' }).click();
    await expect(page).not.toHaveURL(new RegExp(`/setup/${step}$`));
  }

  await page.goto('/setup');
  for (const [, title] of STEPS) {
    const row = page.getByRole('main').getByRole('listitem').filter({ hasText: title });
    await expect(row.getByText('Done', { exact: true })).toBeVisible();
  }
  await expect(page.getByText('Setup 100% done')).toBeVisible();
  // No sideways scrolling at phone width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
});
