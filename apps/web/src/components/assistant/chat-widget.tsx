'use client';

import { Alert, Button, Textarea } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { askAssistant, type ChatTurn } from './actions';

/** "Ask Slotwise": a help chat on every signed-in page; editors can also move classes. */
export function ChatWidget({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('assistant');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [turns, pending]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = () => {
    const text = draft.trim();
    if (!text || pending) return;
    const next: ChatTurn[] = [...turns, { role: 'user', content: text }];
    setTurns(next);
    setDraft('');
    setError(null);
    start(async () => {
      const res = await askAssistant(next);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setTurns([...next, { role: 'assistant', content: res.reply }]);
      // A move changes the timetable on screen.
      router.refresh();
    });
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {open ? (
        <section
          aria-label={t('title')}
          className="flex h-[min(32rem,75vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
        >
          <header className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-base font-semibold">{t('title')}</h2>
              <p className="text-xs text-muted-foreground">{canEdit ? t('hintEdit') : t('hint')}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t('close')}
            </Button>
          </header>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3" aria-live="polite">
            {turns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {canEdit ? t('emptyEdit') : t('empty')}
              </p>
            ) : null}
            {turns.map((turn, i) => (
              <p
                key={i}
                className={
                  turn.role === 'user'
                    ? 'max-w-[85%] self-end whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                    : 'max-w-[85%] self-start whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm'
                }
              >
                <span className="sr-only">{turn.role === 'user' ? t('you') : t('title')}: </span>
                {turn.content}
              </p>
            ))}
            {pending ? <p className="text-sm text-muted-foreground">{t('thinking')}</p> : null}
            {error ? (
              <Alert variant="destructive" role="alert">
                {error}
              </Alert>
            ) : null}
            <div ref={endRef} />
          </div>
          <form
            className="flex items-end gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label htmlFor="assistant-input" className="sr-only">
              {t('label')}
            </label>
            <Textarea
              id="assistant-input"
              ref={inputRef}
              rows={2}
              maxLength={4000}
              value={draft}
              placeholder={t('placeholder')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              className="min-h-0 flex-1 resize-none"
            />
            <Button type="submit" disabled={pending || !draft.trim()}>
              {t('send')}
            </Button>
          </form>
        </section>
      ) : null}
      <Button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-full shadow-lg"
      >
        {open ? t('close') : t('open')}
      </Button>
    </div>
  );
}
