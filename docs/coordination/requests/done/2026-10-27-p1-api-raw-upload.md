# A raw-body call next to api() in lib/api.ts

- Stream: P1
- Streams affected: P6 (exam seating imports later), anyone uploading files
- Files: apps/web/src/lib/api.ts

## What

Export a helper that sends a file (or any bytes) to the API as the request body, with the
same institute header and short-lived token as `api()`.

## Why

Excel/CSV import (ADR 0011) uploads files up to 5 MB. `api()` only sends JSON, and the API's
JSON body limit is 100 KB, so `POST /imports` takes the file as a raw
`application/octet-stream` body. Until this helper exists,
`apps/web/src/app/(app)/imports/upload.server.ts` signs the API token itself (a copy of
`mintApiToken`). Once it lands, P1 deletes that copy.

## Exact proposed diff

```diff
--- a/apps/web/src/lib/api.ts
+++ b/apps/web/src/lib/api.ts
@@
 /** Calls the API as the signed-in user, for the institute on this subdomain. Server-side only. */
 export async function api<T>(
   path: string,
-  init: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {},
+  init: {
+    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
+    body?: unknown;
+    /** Sent as-is with Content-Type application/octet-stream (file uploads). */
+    raw?: Uint8Array;
+  } = {},
 ): Promise<ApiResult<T>> {
@@
-  if (init.body !== undefined) requestHeaders['content-type'] = 'application/json';
+  if (init.raw) requestHeaders['content-type'] = 'application/octet-stream';
+  else if (init.body !== undefined) requestHeaders['content-type'] = 'application/json';
@@
-      body: init.body === undefined ? undefined : JSON.stringify(init.body),
+      body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
```
