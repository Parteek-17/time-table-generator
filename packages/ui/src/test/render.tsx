import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import messages from '../../../../apps/web/messages/en/ui.json';

/** Static HTML of `node` with the kit's English messages, for assertions on markup. */
export function render(node: ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Kolkata">
      {node}
    </NextIntlClientProvider>,
  );
}

/** How many times `needle` occurs in `html`. */
export function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}
