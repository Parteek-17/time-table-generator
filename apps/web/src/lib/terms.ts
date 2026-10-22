import 'server-only';
import type { TermRow } from '@slotwise/shared';
import { list } from './me';

/**
 * Terms for term-bound pages and the one to show: ?term=<id>, else the active term, else
 * the most recent. Null when the institute has no term yet.
 */
export async function pickTerm(termParam: string | undefined): Promise<{
  terms: TermRow[];
  term: TermRow | null;
}> {
  const terms = await list<TermRow>('/terms');
  const term =
    terms.find((t) => t.id === termParam) ??
    terms.find((t) => t.status === 'active') ??
    terms[0] ??
    null;
  return { terms, term };
}
