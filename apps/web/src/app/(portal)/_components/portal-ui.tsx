import type { TodayClassV1 } from '@slotwise/shared/contracts';
import { clock } from '@slotwise/shared/portal';
import { Badge, buttonVariants, cn } from '@slotwise/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Problem } from '@/components/problem';

/**
 * Today | Week, as plain links (no JavaScript); the current one is marked for screen readers.
 * Other portal pages pass no `active`, so neither tab claims to be the page.
 */
export async function PortalTabs({ active }: { active?: 'today' | 'week' }) {
  const t = await getTranslations('p5.nav');
  const tabs = [
    { key: 'today', href: '/today', label: t('today') },
    { key: 'week', href: '/week', label: t('week') },
  ] as const;
  return (
    <nav aria-label={t('label')} className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? 'page' : undefined}
          className={cn(
            'flex h-11 items-center justify-center rounded-md text-base font-medium focus-visible:ring-2 focus-visible:ring-ring',
            tab.key === active
              ? 'bg-background shadow-sm'
              : 'text-muted-foreground hover:bg-background/60',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Locale for dates: the UI language as written in India ("Monday, 10 August", not the US
 * "Monday, August 10" that plain `en` gives).
 */
async function dateLocale(): Promise<string> {
  return `${(await getLocale()).split('-')[0]}-IN`;
}

/** "Monday, 10 August" for a `YYYY-MM-DD` date (`dateStyle` options for other shapes). */
export async function formatDay(
  date: string,
  style: 'long' | 'short' = 'long',
  options?: Intl.DateTimeFormatOptions,
): Promise<string> {
  return new Intl.DateTimeFormat(await dateLocale(), {
    ...(options ?? { weekday: style, day: 'numeric', month: style }),
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** One class: what, when, where, with whom. Cancelled classes say so in words, not colour only. */
export async function ClassItem({
  item,
  badge,
  compact = false,
}: {
  item: TodayClassV1;
  /** e.g. "Now" or "Next". */
  badge?: string;
  compact?: boolean;
}) {
  const t = await getTranslations('p5.common');
  const time = t('time', { start: clock(item.startMinute), end: clock(item.endMinute) });
  return (
    <li
      className={cn(
        'flex flex-col gap-1 rounded-lg border p-3',
        item.cancelled ? 'border-dashed bg-muted/40' : 'bg-card',
        compact ? 'text-sm' : 'text-base',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-semibold">
          <span className={cn(item.cancelled && 'line-through')}>{item.courseShortName}</span>{' '}
          <span className="font-normal text-muted-foreground">{item.courseCode}</span>
        </p>
        <p className="tabular-nums">{time}</p>
      </div>
      {compact ? null : <p className="text-muted-foreground">{item.courseTitle}</p>}
      <p>
        {t(`component.${item.component}`)} ·{' '}
        {item.roomCode ? t('room', { room: item.roomCode }) : t('noRoom')} · {item.withWhom}
      </p>
      {item.cancelled || item.kind === 'makeup' || badge ? (
        <div className="flex flex-wrap gap-2">
          {badge ? <Badge className="border-primary bg-primary/10">{badge}</Badge> : null}
          {item.kind === 'makeup' ? <Badge>{t('makeup')}</Badge> : null}
          {item.cancelled ? (
            <Badge className="border-destructive bg-destructive/10">
              {item.cancelReason
                ? t('cancelledBecause', { reason: item.cancelReason })
                : t('cancelled')}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Previous / middle / next links with 44px targets. */
export function DayPager({
  label,
  previous,
  middle,
  next,
}: {
  label: string;
  previous: { href: string; label: string };
  middle?: { href: string; label: string };
  next: { href: string; label: string };
}) {
  const link = buttonVariants({ variant: 'outline' });
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-2">
      <Link href={previous.href} className={cn(link, 'px-3')} rel="prev">
        <span aria-hidden="true">←</span> {previous.label}
      </Link>
      {middle ? (
        <Link href={middle.href} className={buttonVariants({ variant: 'ghost' })}>
          {middle.label}
        </Link>
      ) : null}
      <Link href={next.href} className={cn(link, 'px-3')} rel="next">
        {next.label} <span aria-hidden="true">→</span>
      </Link>
    </nav>
  );
}

/** A plain-language problem from the API (not linked, unavailable). */
export async function PortalProblem({ status, message }: { status: number; message: string }) {
  const t = await getTranslations('p5.common');
  return (
    <Problem title={status === 404 ? t('notLinkedTitle') : t('problemTitle')} body={message}>
      <Link href="/" className={buttonVariants({ variant: 'outline' })}>
        {t('goHome')}
      </Link>
    </Problem>
  );
}

/** Section with a visible heading that labels it for screen readers. */
export function PortalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
