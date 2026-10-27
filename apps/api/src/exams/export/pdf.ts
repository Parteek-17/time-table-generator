import { existsSync } from 'node:fs';
import type { ExamDocTable } from '@slotwise/shared/exams';
import puppeteer from 'puppeteer-core';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const lines = (s: string) => escape(s).replace(/\n/g, '<br>');

/** Printable HTML: one A4 page (or more, for long lists) per table. */
export function tablesToHtml(tables: ExamDocTable[], title: string, landscape: boolean): string {
  const pages = tables.map((t) => {
    const head = t.header.map((h) => `<th scope="col">${escape(h)}</th>`).join('');
    const rows = t.rows
      .map(
        (row) =>
          `<tr>${row
            .map((cell, i) =>
              i === 0 && t.grid
                ? `<th scope="row">${lines(cell)}</th>`
                : `<td${cell ? '' : ' class="empty"'}>${lines(cell)}</td>`,
            )
            .join('')}</tr>`,
      )
      .join('');
    const footer = t.footer ? `<p class="footer">${escape(t.footer)}</p>` : '';
    return `<section class="${t.grid ? 'grid' : 'list'}"><h1>${escape(t.title)}</h1>
<p>${escape(t.subtitle)}</p>
<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>${footer}</section>`;
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }
  body { font: 9pt/1.3 system-ui, "Segoe UI", Roboto, Arial, sans-serif; color: #111; margin: 0; }
  section { break-after: page; }
  section:last-child { break-after: auto; }
  h1 { font-size: 14pt; margin: 0 0 2pt; }
  p { margin: 0 0 6pt; color: #444; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td { border: 0.6pt solid #888; padding: 3pt 4pt; vertical-align: top; text-align: left; }
  thead th { background: #eee; font-size: 8pt; }
  .grid table { table-layout: fixed; }
  .grid td { height: 22pt; text-align: center; font-size: 8.5pt; }
  .grid td.empty { background: #f6f6f6; }
  .list td:last-child { min-width: 30mm; }
  .footer { margin-top: 10pt; color: #111; }
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
export async function htmlToPdf(
  html: string,
  browserPath: string,
  landscape: boolean,
): Promise<Buffer> {
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
    return Buffer.from(await page.pdf({ format: 'A4', landscape, printBackground: true }));
  } finally {
    await browser.close();
  }
}
