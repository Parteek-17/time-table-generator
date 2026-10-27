# `apiFile()` in the web's API client, and PDF_BROWSER_PATH in .env.example

- Stream: P2T
- Streams affected: INT (P6 will want the same for seating PDFs)
- Files: `apps/web/src/lib/api.ts`, `apps/api/.env.example`, deployment docs

## What

1. `api()` in `apps/web/src/lib/api.ts` reads JSON only. Timetable downloads (PDF, Excel) need
   the API's response body and headers passed through. P2T's route handler
   `apps/web/src/app/(app)/timetable/export/route.ts` signs the same short-lived token itself
   for now. Please add an exported helper, e.g.

   ```ts
   /** Calls the API as the signed-in user and returns the raw Response (files, streams). */
   export async function apiFile(path: string): Promise<Response>;
   ```

   built on the existing `mintApiToken()` and slug header; P2T then drops its copy.

2. `PDF_BROWSER_PATH` (optional) in `apps/api/.env.example`: Chrome or Edge used by
   puppeteer-core for PDF exports. Empty = the usual install places (Edge/Chrome on Windows,
   `/usr/bin/chromium` on Linux). The API host (Railway/Render) needs Chromium installed, e.g.
   `apt-get install chromium` in its image, or the PDF button answers 503 with a plain message.

```diff
--- a/apps/api/.env.example
+++ b/apps/api/.env.example
+# P2T: Chrome/Edge for timetable PDFs; empty = look in the usual install places.
+PDF_BROWSER_PATH=""
```

## Why

One place mints API tokens (ADR 0001); deployers need to know PDFs need a browser.
