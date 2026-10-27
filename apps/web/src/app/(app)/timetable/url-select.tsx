'use client';

import { Label, NativeSelect } from '@slotwise/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId } from 'react';

/**
 * A labelled select bound to one URL parameter (?term=, ?version=). Changing it navigates;
 * `reset` lists parameters that no longer apply afterwards (e.g. the version when the term
 * changes). Hidden when there is nothing to choose.
 */
export function UrlSelect({
  param,
  label,
  value,
  options,
  reset = [],
}: {
  param: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  reset?: string[];
}) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (options.length < 2) return null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Label htmlFor={id} className="whitespace-nowrap">
        {label}
      </Label>
      <NativeSelect
        id={id}
        value={value}
        className="w-auto min-w-0"
        onChange={(e) => {
          const next = new URLSearchParams(params);
          next.set(param, e.target.value);
          for (const key of reset) next.delete(key);
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
