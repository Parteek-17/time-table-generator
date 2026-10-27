/**
 * Milestone 1e in the browser, on the seeded demo institute at phone width: the readiness
 * check explains the missing teacher with a fix button, the button opens the teaching grid,
 * a pick saves at once with a load badge and is undone again (so the test can re-run), and
 * the fixed slots and timetable scope screens open.
 */
import { expect, test } from '@playwright/test';
import { ADMIN, signIn } from './sign-in';

test('readiness → fix button → teaching grid pick with Undo', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/readiness');
  await expect(page.getByRole('heading', { level: 1, name: 'Ready to generate?' })).toBeVisible();
  // The innermost list item: the problem itself, inside its check group.
  const missing = page
    .getByRole('listitem')
    .filter({ hasText: 'ECE S3: no teacher for EC201' })
    .last();
  await expect(missing).toBeVisible();
  await missing.getByRole('link', { name: 'Pick teachers' }).click();

  await expect(page).toHaveURL(/\/teaching\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: /ECE S3/ })).toBeVisible();
  const picker = page.getByLabel('Teacher for EC201 T in EC A');
  await expect(picker).toHaveValue('');
  // Any teacher from ECE; the option text carries the load (assigned/max).
  const option = picker.locator('option', { hasText: ', ECE)' }).first();
  const value = await option.getAttribute('value');
  await picker.selectOption(value!);
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(picker).toHaveValue(value!);
  await expect(
    page.getByText(/\d+\/\d+\s*(Within the limit|Has spare periods|Over the limit)/).first(),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(picker).toHaveValue('');

  await page.goto('/teaching/fixed-slots');
  await expect(page.getByRole('heading', { level: 1, name: 'Fixed slots' })).toBeVisible();
  await page.goto('/teaching/scope');
  await expect(page.getByRole('heading', { level: 1, name: 'Timetable scope' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
});
