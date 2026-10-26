import type { AcademicSessionRow, TermRow } from '@slotwise/shared';
import { getMe, list } from '@/lib/me';
import { TermsManager } from './terms-manager';

/** Sessions and terms; used by /terms and the setup wizard. */
export async function TermsSection() {
  const me = await getMe('/terms');
  const [sessions, terms] = await Promise.all([
    list<AcademicSessionRow>('/sessions'),
    list<TermRow>('/terms'),
  ]);
  return <TermsManager sessions={sessions} terms={terms} canManage={me.may('term.manage')} />;
}
