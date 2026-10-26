/**
 * Setup wizard with the import templates (milestone 1d), at phone width: from the
 * Departments step the admin downloads the template, uploads a sheet with one bad row, fixes
 * it inline and imports; then imports faculty who belong to the new department.
 */
import { expect, test } from '@playwright/test';
import { ADMIN, signIn } from './sign-in';

// The first visit to a page compiles it in `next dev`, which is slow on small laptops.
const FIRST_VISIT = { timeout: 90_000 };

test.setTimeout(300_000);

test('an admin fills setup steps from Excel/CSV sheets, fixing a problem on the way', async ({
  page,
}) => {
  // Codes are unique per institute, so each run uses its own.
  const run = Date.now().toString(36).toUpperCase().slice(-5);
  const dept = `IM${run}`;

  await signIn(page, ADMIN);
  await page.goto('/setup/departments');
  await page.getByRole('link', { name: 'Import Departments' }).click();
  await expect(page).toHaveURL(/\/imports\/new\?kind=departments$/, FIRST_VISIT);
  await expect(page.getByRole('heading', { level: 1, name: 'Upload Departments' })).toBeVisible();

  // The template downloads as an .xlsx.
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download the Departments template' }).click();
  expect((await download).suggestedFilename()).toBe('slotwise-departments-template.xlsx');

  // A sheet in the college's own words, with a bad kind on the second row.
  await page.getByLabel('Excel or CSV file').setInputFiles({
    name: 'departments.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      [
        'Dept Code,Department Name,Type',
        `${dept},Imported Department ${run},Teaching`,
        `${dept}2,Second Imported ${run},Sometimes`,
      ].join('\r\n'),
    ),
  });
  await page.getByRole('button', { name: 'Upload and check' }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: /^Departments: departments\.csv$/ }),
  ).toBeVisible(FIRST_VISIT);
  await expect(page.getByText('Fix or skip the row with a problem first.')).toBeVisible();
  await expect(page.getByText('Kind: “Sometimes” is not one of: Teaching, Service.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import 1 row' })).toBeDisabled();

  // Fix it inline.
  await page.getByRole('button', { name: 'Fix row 3' }).click();
  await page.getByLabel('Kind').fill('Service');
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByText('Kind: “Sometimes” is not one of: Teaching, Service.')).toBeHidden(
    FIRST_VISIT,
  );
  await expect(page.getByRole('button', { name: 'Import 2 rows' })).toBeEnabled();
  await page.getByRole('link', { name: 'All (2)' }).click();
  await expect(page.getByText('Row 3')).toBeVisible();
  await page.getByRole('button', { name: 'Import 2 rows' }).click();

  await expect(page.getByText('2 new, 0 changed, 0 with no change, 0 skipped.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
  await page.getByRole('link', { name: 'Open Departments' }).click();
  await expect(page.getByText(`Imported Department ${run}`)).toBeVisible(FIRST_VISIT);

  // Faculty of the new department, from the Faculty step.
  await page.goto('/setup/faculty');
  await page.getByRole('link', { name: 'Import Faculty' }).click();
  await page.getByLabel('Excel or CSV file').setInputFiles({
    name: 'staff.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      [
        'Emp. Code,Name of Faculty,Initials,Designation,Dept',
        `F${run},Dr. Imported Teacher ${run},T${run},Asst. Prof.,${dept}`,
      ].join('\r\n'),
    ),
  });
  await page.getByRole('button', { name: 'Upload and check' }).click();
  await expect(page.getByText('Row 2')).toBeVisible();
  await page.getByRole('button', { name: 'Import 1 row' }).click();
  await expect(page.getByText('1 new, 0 changed, 0 with no change, 0 skipped.')).toBeVisible();
  await page.getByRole('link', { name: 'Back to setup' }).click();
  await expect(page).toHaveURL(/\/setup$/, FIRST_VISIT);

  await page.goto('/imports');
  await expect(
    page.getByRole('link', { name: 'Open the import of staff.csv' }).first(),
  ).toBeVisible();
});
