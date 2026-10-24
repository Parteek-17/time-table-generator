import type { InstituteProfileDto } from '@slotwise/shared';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { getMe } from '@/lib/me';
import { InstituteForm } from './institute-form';

/** Institute name, type, affiliation and time zone; used by settings and the setup wizard. */
export async function InstituteSection() {
  const me = await getMe('/settings/institute');
  const profile = await api<InstituteProfileDto>('/institute/profile');
  if (!profile.ok) return <Problem title={profile.message} />;
  return <InstituteForm profile={profile.data} canEdit={me.may('institute.manage')} />;
}
