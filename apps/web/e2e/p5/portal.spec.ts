/**
 * Today and the week for the demo student and teacher (seed: student@demo.slotwise.test in
 * CS B, faculty@demo.slotwise.test). Phone width; keyboard reachable; two taps to the week.
 */
import { expect, test } from '@playwright/test';
import { ADMIN, signIn, STUDENT, TEACHER } from './sign-in';

test('a student opens Today and reaches the week in one more tap', async ({ page }) => {
  await signIn(page, STUDENT);
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Demo Student')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Classes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Changes this week' })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'My timetable' })
    .getByRole('link', { name: 'Week' })
    .click();
  await expect(page).toHaveURL(/\/week/);
  await expect(page.getByRole('link', { name: 'Week' })).toHaveAttribute('aria-current', 'page');

  await page.getByRole('link', { name: /Next week/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Week of');
});

test('a teacher sees their own day', async ({ page }) => {
  await signIn(page, TEACHER);
  await page.goto('/today');
  await expect(page.getByText('Demo Faculty').or(page.getByText(/· KN/))).toBeVisible();
  await page.getByRole('link', { name: /Next day/ }).click();
  await expect(page).toHaveURL(/date=/);
  await expect(page.getByRole('link', { name: 'Back to today' })).toBeVisible();
});

test('an admin without a student or teacher record is told why', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/today');
  await expect(page.getByText('We couldn’t find your timetable')).toBeVisible();
});

test('Today works with the keyboard alone', async ({ page }) => {
  await signIn(page, STUDENT);
  await page.goto('/today');
  await page.keyboard.press('Tab');
  for (let i = 0; i < 8; i += 1) {
    if (
      await page.getByRole('link', { name: 'Week' }).evaluate((el) => el === document.activeElement)
    )
      break;
    await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/week/);
});

test('a student signs in with roll number and the emailed code, no password', async ({ page }) => {
  const since = Date.now();
  await page.goto('/student-sign-in');
  await page.getByLabel('Roll number').fill('demo-s001');
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await expect(page.getByRole('status')).toContainText('We sent a 6-digit code');

  let code = '';
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${process.env.MAILPIT_URL ?? 'http://localhost:8025'}/api/v1/search?query=${encodeURIComponent(`to:${STUDENT}`)}`,
        );
        const latest = ((await res.json()) as { messages: { Subject: string; Created: string }[] })
          .messages[0];
        if (!latest || Date.parse(latest.Created) < since - 1000) return false;
        code = /^(\d{6}) /.exec(latest.Subject)?.[1] ?? '';
        return code.length === 6;
      },
      { message: 'code email in Mailpit', timeout: 30_000 },
    )
    .toBe(true);

  await page.getByLabel('Code from the email').fill('000000' === code ? '111111' : '000000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/That code isn’t right/)).toBeVisible();

  await page.getByLabel('Code from the email').fill(code);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByText('Demo Student')).toBeVisible();
});
