'use client';

import { Button, Input, Label } from '@slotwise/ui';
import { useId, useState } from 'react';

/** A read-only address with a Copy button; when the clipboard is blocked, the text is selected. */
export function CopyField({
  label,
  value,
  copyLabel,
  copiedLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input id={id} readOnly value={value} className="min-w-0 flex-1 font-mono text-sm" />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            } catch {
              (document.getElementById(id) as HTMLInputElement | null)?.select();
            }
          }}
        >
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
      <span role="status" className="sr-only">
        {copied ? copiedLabel : ''}
      </span>
    </div>
  );
}
