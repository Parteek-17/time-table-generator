import { describe, expect, it } from 'vitest';
import { belongsToInstitute, can, type AuthUser, type MembershipGrant } from './can';

const INST_A = 'inst-a';
const INST_B = 'inst-b';
const UNIV = 'univ-1';
const CSE = 'dept-cse';
const ECE = 'dept-ece';

function user(...memberships: MembershipGrant[]): AuthUser {
  return { id: 'u1', memberships };
}

const instituteAdminA = user({
  role: 'institute_admin',
  scopeType: 'institute',
  scopeId: INST_A,
  instituteId: INST_A,
});
const hodCse = user({ role: 'hod', scopeType: 'department', scopeId: CSE, instituteId: INST_A });
const facultyCse = user({
  role: 'faculty',
  scopeType: 'department',
  scopeId: CSE,
  instituteId: INST_A,
});
const studentA = user({
  role: 'student',
  scopeType: 'institute',
  scopeId: INST_A,
  instituteId: INST_A,
});

describe('can() — institute_admin', () => {
  it('can manage any department in their institute (scope inheritance)', () => {
    expect(can(instituteAdminA, 'department.manage', { type: 'department', instituteId: INST_A, departmentId: CSE })).toBe(true);
    expect(can(instituteAdminA, 'department.manage', { type: 'department', instituteId: INST_A, departmentId: ECE })).toBe(true);
  });

  it('cannot touch another institute', () => {
    expect(can(instituteAdminA, 'department.manage', { type: 'department', instituteId: INST_B, departmentId: 'x' })).toBe(false);
    expect(can(instituteAdminA, 'institute.view', { type: 'institute', instituteId: INST_B })).toBe(false);
  });

  it('can invite a hod for a department but not a platform or university admin', () => {
    const resource = { type: 'invite', instituteId: INST_A, departmentId: CSE } as const;
    expect(can(instituteAdminA, 'member.invite', { ...resource, role: 'hod' })).toBe(true);
    expect(can(instituteAdminA, 'member.invite', { ...resource, role: 'platform_admin' })).toBe(false);
    expect(can(instituteAdminA, 'member.invite', { ...resource, role: 'university_admin' })).toBe(false);
  });

  it('member.invite needs the role being granted', () => {
    expect(can(instituteAdminA, 'member.invite', { type: 'invite', instituteId: INST_A })).toBe(false);
  });
});

describe('can() — hod', () => {
  it('can manage their own department', () => {
    expect(can(hodCse, 'department.manage', { type: 'department', instituteId: INST_A, departmentId: CSE })).toBe(true);
  });

  it('cannot touch another department', () => {
    expect(can(hodCse, 'department.manage', { type: 'department', instituteId: INST_A, departmentId: ECE })).toBe(false);
    expect(can(hodCse, 'member.invite', { type: 'invite', instituteId: INST_A, departmentId: ECE, role: 'faculty' })).toBe(false);
    expect(can(hodCse, 'timetable.edit', { type: 'timetable', instituteId: INST_A, departmentId: ECE })).toBe(false);
  });

  it('cannot manage institute-wide things', () => {
    expect(can(hodCse, 'institute.manage', { type: 'institute', instituteId: INST_A })).toBe(false);
    expect(can(hodCse, 'member.invite', { type: 'invite', instituteId: INST_A, role: 'timetable_coordinator' })).toBe(false);
  });

  it('can invite faculty to their department but not another hod or an institute admin', () => {
    const resource = { type: 'invite', instituteId: INST_A, departmentId: CSE } as const;
    expect(can(hodCse, 'member.invite', { ...resource, role: 'faculty' })).toBe(true);
    expect(can(hodCse, 'member.invite', { ...resource, role: 'hod' })).toBe(false);
    expect(can(hodCse, 'member.invite', { ...resource, role: 'institute_admin' })).toBe(false);
  });

  it('can still read institute-wide things like timetables of other departments', () => {
    expect(can(hodCse, 'timetable.view', { type: 'timetable', instituteId: INST_A, departmentId: ECE })).toBe(true);
    expect(can(hodCse, 'institute.view', { type: 'institute', instituteId: INST_A })).toBe(true);
  });

  it('cannot read another institute', () => {
    expect(can(hodCse, 'timetable.view', { type: 'timetable', instituteId: INST_B })).toBe(false);
  });
});

describe('can() — faculty and student are read-only', () => {
  const writes = [
    'institute.manage',
    'department.manage',
    'member.invite',
    'member.revoke',
    'timetable.edit',
    'timetable.publish',
  ] as const;

  it.each(writes)('faculty cannot %s', (action) => {
    expect(can(facultyCse, action, { type: 'department', instituteId: INST_A, departmentId: CSE, role: 'student' })).toBe(false);
  });

  it.each(writes)('student cannot %s', (action) => {
    expect(can(studentA, action, { type: 'institute', instituteId: INST_A, role: 'student' })).toBe(false);
  });

  it('both can read published timetables in their institute', () => {
    expect(can(facultyCse, 'timetable.view', { type: 'timetable', instituteId: INST_A, departmentId: ECE })).toBe(true);
    expect(can(studentA, 'timetable.view', { type: 'timetable', instituteId: INST_A, departmentId: CSE })).toBe(true);
  });

  it('neither can list members', () => {
    expect(can(facultyCse, 'member.view', { type: 'membership', instituteId: INST_A, departmentId: CSE })).toBe(false);
    expect(can(studentA, 'member.view', { type: 'membership', instituteId: INST_A })).toBe(false);
  });
});

describe('can() — wider scopes', () => {
  const platformAdmin = user({ role: 'platform_admin', scopeType: 'platform', scopeId: null, instituteId: null });
  const universityAdmin = user({ role: 'university_admin', scopeType: 'university', scopeId: UNIV, instituteId: UNIV });

  it('platform_admin can do anything anywhere', () => {
    expect(can(platformAdmin, 'institute.manage', { type: 'institute', instituteId: INST_B })).toBe(true);
    expect(can(platformAdmin, 'member.invite', { type: 'invite', instituteId: INST_A, role: 'institute_admin' })).toBe(true);
  });

  it('university_admin reaches affiliated colleges but not unrelated institutes', () => {
    expect(can(universityAdmin, 'institute.manage', { type: 'institute', instituteId: INST_A, universityId: UNIV })).toBe(true);
    expect(can(universityAdmin, 'institute.manage', { type: 'institute', instituteId: UNIV })).toBe(true);
    expect(can(universityAdmin, 'institute.manage', { type: 'institute', instituteId: INST_B, universityId: null })).toBe(false);
  });

  it('a user with no memberships can do nothing', () => {
    expect(can(user(), 'institute.view', { type: 'institute', instituteId: INST_A })).toBe(false);
  });

  it('several memberships combine', () => {
    const both = user(hodCse.memberships[0]!, {
      role: 'faculty',
      scopeType: 'department',
      scopeId: ECE,
      instituteId: INST_A,
    });
    expect(can(both, 'department.manage', { type: 'department', instituteId: INST_A, departmentId: CSE })).toBe(true);
    expect(can(both, 'department.manage', { type: 'department', instituteId: INST_A, departmentId: ECE })).toBe(false);
  });
});

describe('belongsToInstitute()', () => {
  it('is true for any membership in the institute and false otherwise', () => {
    expect(belongsToInstitute(studentA, { id: INST_A })).toBe(true);
    expect(belongsToInstitute(hodCse, { id: INST_A })).toBe(true);
    expect(belongsToInstitute(hodCse, { id: INST_B })).toBe(false);
  });
});
