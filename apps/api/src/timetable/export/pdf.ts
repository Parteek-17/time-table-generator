import { existsSync } from 'node:fs';
import type { ExportTable } from '@slotwise/shared/timetable';
import puppeteer from 'puppeteer-core';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Printable HTML: one landscape A4 page per week. */
export function tablesToHtml(tables: ExportTable[], subtitle: string): string {
  const pages = tables.map((table) => {
    const head = table.header.map((h) => `<th scope="col">${escape(h)}</th>`).join('');
    const rows = table.rows
      .map((row) => {
        const cells = row.cells
          .map((cell) => {
            const span = cell.span > 1 ? ` colspan="${cell.span}"` : '';
            if (cell.kind === 'break') return `<td class="break">${escape(cell.label)}</td>`;
            const classes = cell.classes
              .map(
                ([course, details]) =>
                  `<div class="class"><b>${escape(course)}</b><br>${escape(details)}</div>`,
              )
              .join('');
            return `<td${span}>${classes}</td>`;
          })
          .join('');
        return `<tr><th scope="row">${escape(row.day)}</th>${cells}</tr>`;
      })
      .join('');
    return `<section><h1>${escape(table.title)}</h1><p>${escape(subtitle)}</p>
<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></section>`;
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Timetable</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font: 9pt/1.3 system-ui, "Segoe UI", Roboto, Arial, sans-serif; color: #111; margin: 0; }
  section { break-after: page; }
  section:last-child { break-after: auto; }
  h1 { font-size: 14pt; margin: 0 0 2pt; }
  p { margin: 0 0 6pt; color: #555; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 0.6pt solid #888; padding: 3pt; vertical-align: top; text-align: left; }
  thead th { background: #eee; font-size: 8pt; }
  tbody th { width: 11%; }
  td.break { background: #f5f5f5; color: #555; font-size: 8pt; writing-mode: vertical-rl; }
  .class + .class { margin-top: 3pt; border-top: 0.4pt dashed #aaa; padding-top: 3pt; }
</style></head><body>${pages.join('\n')}</body></html>`;
}

/** Chrome or Edge to print with: PDF_BROWSER_PATH, else the usual install places. */
export function findBrowser(configured: string | undefined): string | null {
  const candidates = [
    configured,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return candidates.find((p): p is string => !!p && existsSync(p)) ?? null;
}

/** HTML → PDF with a headless browser started for this one file. */
export async function htmlToPdf(html: string, browserPath: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    // No network: everything is inline.
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: 'load' });
    return Buffer.from(await page.pdf({ format: 'A4', landscape: true, printBackground: true }));
  } finally {
    await browser.close();
  }
}
