import type { Me } from '@/lib/me';
import { coreMore, coreTop } from './core';
import p1 from './p1';
import p2t from './p2t';
import p4 from './p4';
import p5 from './p5';
import p6 from './p6';
import p7 from './p7';
import type { NavGroup, NavSource } from './types';
import ui from './ui';

/**
 * Fixed order: home, then streams in merge order (docs/coordination/MERGE-ORDER.md), then
 * "More". Streams edit only their own file here; this file belongs to INT.
 */
const SOURCES: NavSource[] = [coreTop, p1, p2t, p4, p6, p5, p7, ui, coreMore];

/** Navigation for what this user may do here. */
export async function navFor(me: Me): Promise<NavGroup[]> {
  const groups = await Promise.all(SOURCES.map((source) => source(me)));
  return groups.flat().filter((g) => g.items.length > 0);
}
