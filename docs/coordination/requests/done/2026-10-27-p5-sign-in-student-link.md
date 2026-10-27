# A "Student? Use your roll number" link on the sign-in page

- Stream: P5
- Streams affected: INT (sign-in page)
- Files: `apps/web/src/app/sign-in/page.tsx`, `apps/web/messages/en/core.json`

## What

Under the email form, when the P5 flag is on and the page is on an institute subdomain, add a
link to `/student-sign-in` (P5's roll number + code page, ADR 0070), keeping `callbackUrl`.

## Why

Students reach `/sign-in` first: the portal layout's `getMe()` redirects there when signed
out, and the home page does too. Without the link they'd have to know the URL.

## Exact proposed diff

```diff
+import { isFlagOn } from '@slotwise/shared';
@@ (after <SignInForm … />)
+          {slug && isFlagOn('P5') ? (
+            <p className="text-sm text-muted-foreground">
+              {t('student')}{' '}
+              <Link href="/student-sign-in" className="text-primary underline underline-offset-4">
+                {t('studentLink')}
+              </Link>
+            </p>
+          ) : null}
```

`core.json` → `signIn`: `"student": "Student?"`, `"studentLink": "Sign in with your roll number"`.
