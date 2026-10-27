/**
 * Setup wizard happy path (milestones 1c and 1e), entered by hand: an institute admin walks
 * the twelve steps at phone width, adds a department on the way (and archives it again with
 * Undo available), sees the teaching grid overview and the readiness check, and the overview
 * shows every step done.
 */
import { expect, test } from '@playwright/test';
import { ADMIN, signIn } from './sign-in';

/** Steps the admin completes in the wizard, in order. */
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
  ['teaching', 'Who teaches what'],
  ['ready', 'Ready to generate?'],
] as const;

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

    if (step === 'teaching') {
      await expect(page.getByRole('heading', { name: 'Cohorts running this term' })).toBeVisible();
    }
    if (step === 'ready') {
      // The seven check groups, and either the problems to fix or "Nothing is missing".
      await expect(
        page.getByRole('heading', { name: '3. Teachers for every class' }),
      ).toBeVisible();
      await expect(page.getByText(/problems? to fix|Nothing is missing/)).toBeVisible();
    }

    const last = i === STEPS.length - 1;
    await page.getByRole('button', { name: last ? 'Finish' : 'Save and continue' }).click();
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
