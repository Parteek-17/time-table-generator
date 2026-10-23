import 'server-only';
import type { TermRow } from '@slotwise/shared';
import type { TimetableViewDto, VersionSummaryDto, ViewKind } from '@slotwise/shared/timetable';
import { api, type ApiResult } from '@/lib/api';
import { list } from '@/lib/me';

/**
 * The term to show: ?term=<id>, else the active term, else the most recent. Reads P1's
 * `/terms` route over HTTP (never P1's code).
 */
export async function termsAndCurrent(termParam: string | undefined) {
  const terms = await list<TermRow>('/terms');
  const term =
    terms.find((t) => t.id === termParam) ??
    terms.find((t) => t.status === 'active') ??
    terms[0] ??
    null;
  return { terms, term };
}

export function versionsOf(termId: string): Promise<ApiResult<VersionSummaryDto[]>> {
  return api<VersionSummaryDto[]>(`/terms/${termId}/timetable/versions`);
}

/** ?version=, else the published one, else the newest (a draft, for editors). */
export function pickVersion(
  versions: VersionSummaryDto[],
  versionParam: string | undefined,
): VersionSummaryDto | null {
  return (
    versions.find((v) => v.id === versionParam) ??
    versions.find((v) => v.status === 'published') ??
    versions[0] ??
    null
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KINDS: readonly string[] = ['section', 'subgroup', 'faculty', 'room'];

/** The week to draw. An unknown ?id= falls back to the kind's first entry. */
export async function viewOf(
  versionId: string,
  kindParam: string | undefined,
  idParam: string | undefined,
): Promise<ApiResult<TimetableViewDto>> {
  const kind = KINDS.includes(kindParam ?? '') ? (kindParam as ViewKind) : 'section';
  const query = new URLSearchParams({ kind });
  if (idParam && UUID.test(idParam)) query.set('id', idParam);
  const res = await api<TimetableViewDto>(`/timetable/versions/${versionId}/view?${query}`);
  if (!res.ok && res.status === 404 && query.has('id')) {
    return api<TimetableViewDto>(`/timetable/versions/${versionId}/view?kind=${kind}`);
  }
  return res;
}
