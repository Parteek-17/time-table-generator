import { IMPORT_KINDS, type ImportTemplateFileDto } from '@slotwise/shared';
import { api } from '@/lib/api';

/** Downloads the .xlsx template for one kind of import (with its "How to fill" sheet). */
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!(IMPORT_KINDS as readonly string[]).includes(kind)) {
    return new Response('Unknown template', { status: 404 });
  }
  const res = await api<ImportTemplateFileDto>(`/imports/templates/${kind}`);
  if (!res.ok) return new Response(res.message, { status: res.status });
  return new Response(Buffer.from(res.data.contentBase64, 'base64'), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${res.data.fileName}"`,
      'cache-control': 'no-store',
    },
  });
}
