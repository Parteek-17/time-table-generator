import type { NavGroup } from '@/components/app-nav';
import type { Me } from '@/lib/me';

export type { NavGroup };

/**
 * A stream's navigation: the groups this user may see (decide with me.may(), never role
 * names; hide everything while the stream's flag is off). Labels come from the stream's own
 * messages file.
 */
export type NavSource = (me: Me) => Promise<NavGroup[]>;
