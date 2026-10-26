'use client';

import type { ImportJobDto } from '@slotwise/shared';
import { Alert, Button, Card, CardContent, Input, Label, NativeSelect } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

interface KindOption {
  value: string;
  label: string;
  term: 'required' | 'optional' | 'none';
}

/** Upload form. Posts to /imports/upload, then opens the import's preview. */
export function UploadForm({
  kinds,
  initialKind,
  terms,
  initialTerm,
}: {
  kinds: KindOption[];
  initialKind: string;
  terms: { value: string; label: string }[];
  initialTerm: string;
}) {
  const t = useTranslations('p1.imports');
  const router = useRouter();
  const ids = { kind: useId(), term: useId(), file: useId(), fileHint: useId(), termHint: useId() };
  const [kind, setKind] = useState(initialKind);
  const [termId, setTermId] = useState(initialTerm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const option = kinds.find((k) => k.value === kind)!;
  const needsTerm = option.term === 'required';
  const blocked = needsTerm && terms.length === 0;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/imports/upload', {
        method: 'POST',
        body: new FormData(e.currentTarget),
      });
      const body = (await res.json().catch(() => null)) as
        { ok: true; data: ImportJobDto } | { ok: false; message: string } | null;
      if (body?.ok) {
        router.push(`/imports/${body.data.id}`);
        return;
      }
      setError(body?.message ?? t('uploadFailed'));
    } catch {
      setError(t('uploadFailed'));
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={busy}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.kind}>{t('chooseKind')}</Label>
            <NativeSelect
              id={ids.kind}
              name="kind"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                router.replace(`/imports/new?kind=${e.target.value}`, { scroll: false });
              }}
            >
              {kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </NativeSelect>
            <p className="text-sm text-muted-foreground">
              {t('noSheet')}{' '}
              <a className="text-primary underline" href={`/imports/templates/${kind}`} download>
                {t('templateLink', { kind: option.label })}
              </a>
            </p>
          </div>

          {option.term !== 'none' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={ids.term}>{t('term')}</Label>
              {terms.length === 0 ? (
                <p id={ids.termHint} className="text-sm text-muted-foreground">
                  {t('needTerm')}
                </p>
              ) : (
                <>
                  <NativeSelect
                    id={ids.term}
                    name="termId"
                    value={termId}
                    aria-describedby={ids.termHint}
                    onChange={(e) => setTermId(e.target.value)}
                  >
                    {needsTerm ? null : <option value="">{t('noTerm')}</option>}
                    {terms.map((x) => (
                      <option key={x.value} value={x.value}>
                        {x.label}
                      </option>
                    ))}
                  </NativeSelect>
                  <p id={ids.termHint} className="text-sm text-muted-foreground">
                    {needsTerm ? t('termRequired') : t('termOptional')}
                  </p>
                </>
              )}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.file}>{t('file')}</Label>
            <Input
              id={ids.file}
              name="file"
              type="file"
              required
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              aria-describedby={ids.fileHint}
              className="h-auto py-2"
            />
            <p id={ids.fileHint} className="text-sm text-muted-foreground">
              {t('fileHint')}
            </p>
          </div>

          {error ? (
            <Alert variant="destructive" role="alert">
              {error}
            </Alert>
          ) : null}

          <div>
            <Button type="submit" disabled={busy || blocked}>
              {busy ? t('uploading') : t('uploadButton')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
