import { Card, CardDescription, CardHeader, CardTitle } from '@slotwise/ui';
import type { ReactNode } from 'react';

/** A plain-language explanation of why something can't be shown, plus what to do next. */
export function Problem({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {body ? <CardDescription className="text-base">{body}</CardDescription> : null}
        {children ? <div className="mt-2 flex flex-wrap gap-2">{children}</div> : null}
      </CardHeader>
    </Card>
  );
}
