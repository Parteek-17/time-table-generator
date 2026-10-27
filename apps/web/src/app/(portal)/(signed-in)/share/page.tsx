import type { PublicLinksV1 } from '@slotwise/shared/portal';
import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  NativeSelect,
} from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { api } from '@/lib/api';
import { getMe } from '@/lib/me';
import { CopyField } from '../../_components/copy-field';
import { PortalProblem } from '../../_components/portal-ui';
import { absoluteUrl } from '../../_components/public-api';
import { createLink, revokeLink } from './actions';

export const metadata: Metadata = { title: 'Notice-board links' };

/**
 * Public read-only links and QR codes for published section and room timetables: print the
 * QR for a classroom door or notice board, or paste the link in a WhatsApp group.
 */
export default async function SharePage() {
  const me = await getMe('/share');
  if (!me.may('timetable.publish')) notFound();
  const [t, res] = await Promise.all([
    getTranslations('p5.share'),
    api<PublicLinksV1>('/portal/links'),
  ]);
  if (!res.ok) return <PortalProblem status={res.status} message={res.message} />;
  const { links, choices } = res.data;
  const cards = await Promise.all(
    links.map(async (link) => {
      const url = await absoluteUrl(link.path);
      const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
      return { link, url, svg };
    }),
  );

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <form action={createLink} className="flex flex-col gap-2">
        <Label htmlFor="target">{t('pick')}</Label>
        <div className="flex flex-wrap gap-2">
          <NativeSelect
            id="target"
            name="target"
            required
            className="min-w-0 flex-1"
            defaultValue=""
          >
            <option value="" disabled>
              {t('pickPlaceholder')}
            </option>
            {choices.sections.length > 0 ? (
              <optgroup label={t('sections')}>
                {choices.sections.map((s) => (
                  <option key={s.id} value={`section:${s.id}`}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {choices.rooms.length > 0 ? (
              <optgroup label={t('rooms')}>
                {choices.rooms.map((r) => (
                  <option key={r.id} value={`room:${r.id}`}>
                    {r.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </NativeSelect>
          <Button type="submit">{t('make')}</Button>
        </div>
      </form>

      {cards.length === 0 ? (
        <p className="text-muted-foreground">{t('none')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {cards.map(({ link, url, svg }) => (
            <li key={link.id}>
              <Card>
                <CardHeader>
                  <CardTitle>{link.label}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row">
                  <figure className="flex shrink-0 flex-col items-center gap-1">
                    <div
                      role="img"
                      aria-label={t('qrLabel', { label: link.label })}
                      className="size-40 bg-white p-1 text-black [&_svg]:size-full"
                      dangerouslySetInnerHTML={{ __html: svg }}
                    />
                    <a
                      href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
                      download={`timetable-${link.label.replace(/\W+/g, '-').toLowerCase()}-qr.svg`}
                      className="text-sm text-primary underline underline-offset-4"
                    >
                      {t('downloadQr')}
                    </a>
                  </figure>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <CopyField
                      label={t('address')}
                      value={url}
                      copyLabel={t('copy')}
                      copiedLabel={t('copied')}
                    />
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={link.path}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({ variant: 'outline' })}
                      >
                        {t('open')}
                      </a>
                      <form action={revokeLink}>
                        <input type="hidden" name="id" value={link.id} />
                        <Button type="submit" variant="ghost">
                          {t('stop')}
                        </Button>
                      </form>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
