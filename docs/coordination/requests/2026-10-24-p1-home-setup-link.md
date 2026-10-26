# Request: home page points admins to /setup until setup is done

- From: P1
- To: INT
- Date: 2026-10-24
- Files: `apps/web/src/app/page.tsx` (INT)

## What

The home page's "Set up your institute" card links to six settings pages. Since milestone 1c
there is a guided wizard with progress and "Needs attention" at `/setup`
(`GET /setup` → `SetupStateDto` from `@slotwise/shared`). Make the card lead there:

```diff
-      {canSetUp ? (
+      {canSetUp ? (
         <Card>
           <CardHeader>
             <CardTitle>{t('setupTitle')}</CardTitle>
             <CardDescription>{t('setupHint')}</CardDescription>
-            <div className="mt-2 flex flex-wrap gap-2">
-              {( [['/programmes', 'setupProgrammes'], …] as const ).map(…)}
-            </div>
+            <Button asChild className="mt-2 self-start">
+              <Link href="/setup">{t('setupOpen')}</Link>
+            </Button>
           </CardHeader>
         </Card>
       ) : null}
```

with `home.setupOpen: "Open setup"` in `messages/en/core.json`. Optionally show the
percentage from `GET /setup` (`percent`) in the card.

## Why

CLAUDE.md: admins land on "what needs attention". The wizard holds that list; the home page
is INT's, so P1 can't change it.

## Until then

`/setup` is reachable from the navigation ("Setup progress", first item under "Set up").
