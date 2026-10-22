'use client';

import { cn } from '@slotwise/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavGroup {
  label?: string;
  items: { href: string; label: string }[];
}

function isCurrent(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Links of the app shell. Shown as a sidebar on wide screens and inside "Menu" on phones. */
export function AppNav({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-4 text-sm">
      {groups.map((g, i) => (
        <div key={g.label ?? i} className="flex flex-col gap-1">
          {g.label ? (
            <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {g.label}
            </p>
          ) : null}
          <ul className="flex flex-col">
            {g.items.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center rounded-lg px-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      current && 'bg-muted font-semibold text-primary',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Phone menu: a native disclosure, so it works with the keyboard and screen readers. */
export function MobileMenu({ groups, label }: { groups: NavGroup[]; label: string }) {
  return (
    <details className="group lg:hidden">
      <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      <div className="absolute inset-x-0 z-40 mt-2 max-h-[75dvh] overflow-y-auto border-y bg-background p-3 shadow-lg">
        <AppNav
          groups={groups}
          onNavigate={() =>
            document.querySelector<HTMLDetailsElement>('details[open]')?.removeAttribute('open')
          }
        />
      </div>
    </details>
  );
}
