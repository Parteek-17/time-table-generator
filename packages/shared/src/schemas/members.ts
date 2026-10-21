import { z } from 'zod';
import type { MembershipGrant } from '../auth/can';
import { INVITABLE_SCOPE_TYPES, ROLES, isScopeAllowedForRole } from '../auth/roles';

export const roleSchema = z.enum(ROLES);
export const invitableScopeTypeSchema = z.enum(INVITABLE_SCOPE_TYPES);

/** Body of POST /invites. Messages are shown to users, so keep them plain. */
export const createInviteSchema = z
  .object({
    email: z.email({ error: 'Enter a valid email address.' }).trim().toLowerCase(),
    role: roleSchema,
    scopeType: invitableScopeTypeSchema,
    /** Department id when scopeType is "department". Ignored for "institute". */
    departmentId: z.uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (!isScopeAllowedForRole(value.role, value.scopeType)) {
      ctx.addIssue({
        code: 'custom',
        path: ['scopeType'],
        message:
          'This role cannot be given at that level. Pick a department or the whole institute.',
      });
    }
    if (value.scopeType === 'department' && !value.departmentId) {
      ctx.addIssue({ code: 'custom', path: ['departmentId'], message: 'Choose a department.' });
    }
  });
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);
export const idParamSchema = z.uuid();

// ---- Response shapes (API → web) ----

export interface ScopeDto {
  type: 'platform' | 'university' | 'institute' | 'department' | 'section';
  id: string | null;
  /** Human name: institute or department name. */
  name: string;
}

export interface MembershipDto {
  id: string;
  role: z.infer<typeof roleSchema>;
  scope: ScopeDto;
}

export interface InstituteDto {
  id: string;
  name: string;
  slug: string;
  type: 'college' | 'university';
  timezone: string;
  parentUniversityId: string | null;
}

export interface MeResponse {
  user: { id: string; name: string | null; email: string };
  institute: InstituteDto;
  /** Memberships in this institute (plus platform/university ones that reach it). */
  memberships: MembershipDto[];
  /** Raw grants, so the web can call can() to show or hide UI. The API re-checks every call. */
  grants: MembershipGrant[];
}

export interface MemberDto {
  membershipId: string;
  user: { id: string; name: string | null; email: string };
  role: z.infer<typeof roleSchema>;
  scope: ScopeDto;
  createdAt: string;
  revokedAt: string | null;
}

export interface InviteDto {
  id: string;
  email: string;
  role: z.infer<typeof roleSchema>;
  scope: ScopeDto;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface CreateInviteResponse {
  invite: InviteDto;
  /** Link to share if the email doesn't arrive (WhatsApp, etc.). */
  acceptUrl: string;
  emailSent: boolean;
}

export interface InvitePreviewDto {
  instituteName: string;
  email: string;
  role: z.infer<typeof roleSchema>;
  scope: ScopeDto;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
}

export interface DepartmentDto {
  id: string;
  name: string;
  code: string;
}
