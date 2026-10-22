import { describe, expect, it } from 'vitest';
import { can, canSomewhere, type AuthUser, type MembershipGrant, type Resource } from './can';

const INST = 'inst-a';
const OTHER_INST = 'inst-b';
const CSE = 'dept-cse';
const ECE = 'dept-ece';
const AS = 'dept-applied-sciences';

function user(id: string, ...memberships: MembershipGrant[]): AuthUser {
  return { id, memberships };
}
const at = (
  role: MembershipGrant['role'],
  scopeType: MembershipGrant['scopeType'],
  scopeId: string,
) => ({ role, scopeType, scopeId, instituteId: INST }) as MembershipGrant;

const admin = user('admin', at('institute_admin', 'institute', INST));
const hodCse = user('hod-cse', at('hod', 'department', CSE));
const hodAs = user('hod-as', at('hod', 'department', AS));
const coordCse = user('coord-cse', at('timetable_coordinator', 'department', CSE));
const coordInst = user('coord-inst', at('timetable_coordinator', 'institute', INST));
const facultyKaur = user('user-kaur', at('faculty', 'department', CSE));
const examCoord = user('exam', at('exam_coordinator', 'institute', INST));
const student = user('student', at('student', 'institute', INST));

const res = (type: Resource['type'], extra: Partial<Resource> = {}): Resource => ({
  type,
  instituteId: INST,
  ...extra,
});

describe('master data reads', () => {
  it('every staff role reads master data anywhere in the institute', () => {
    for (const u of [admin, hodCse, hodAs, coordCse, facultyKaur, examCoord]) {
      expect(can(u, 'masterdata.view', res('cohort', { departmentId: ECE }))).toBe(true);
    }
  });

  it('students do not read master data', () => {
    expect(can(student, 'masterdata.view', res('faculty'))).toBe(false);
  });

  it('nobody reads another institute', () => {
    expect(can(hodCse, 'masterdata.view', { type: 'cohort', instituteId: OTHER_INST })).toBe(false);
    expect(can(admin, 'masterdata.view', { type: 'cohort', instituteId: OTHER_INST })).toBe(false);
  });
});

describe('institute_admin edits everything', () => {
  it.each([
    ['term.manage', res('term')],
    ['calendar.manage', res('calendar')],
    ['infrastructure.manage', res('room')],
    ['academics.manage', res('programme')],
    ['cohort.manage', res('section', { departmentId: ECE })],
    ['faculty.manage', res('faculty', { departmentId: AS })],
    ['teaching.manage', res('teaching_assignment', { departmentId: CSE })],
    ['fixed_slot.manage', res('fixed_slot')],
    ['timetable_scope.manage', res('timetable_scope')],
    ['faculty.availability.edit', res('faculty', { departmentId: CSE, ownerUserId: 'someone' })],
  ] as const)('%s', (action, resource) => {
    expect(can(admin, action, resource)).toBe(true);
  });
});

describe('hod', () => {
  it("edits their department's programmes, courses, batches, sections and faculty", () => {
    for (const [action, type] of [
      ['academics.manage', 'course'],
      ['cohort.manage', 'section'],
      ['cohort.manage', 'batch'],
      ['faculty.manage', 'faculty'],
    ] as const) {
      expect(can(hodCse, action, res(type, { departmentId: CSE }))).toBe(true);
    }
  });

  it("cannot edit another department's data", () => {
    for (const [action, type] of [
      ['academics.manage', 'course'],
      ['cohort.manage', 'section'],
      ['faculty.manage', 'faculty'],
      ['faculty.availability.edit', 'faculty'],
      ['teaching.manage', 'teaching_assignment'],
    ] as const) {
      expect(can(hodCse, action, res(type, { departmentId: ECE }))).toBe(false);
    }
  });

  it('cannot edit institute-owned data (B.Tech programme, rooms, terms, calendar)', () => {
    expect(can(hodCse, 'academics.manage', res('programme', { departmentId: null }))).toBe(false);
    expect(can(hodCse, 'infrastructure.manage', res('room', { departmentId: CSE }))).toBe(false);
    expect(can(hodCse, 'term.manage', res('term'))).toBe(false);
    expect(can(hodCse, 'calendar.manage', res('calendar'))).toBe(false);
    expect(can(hodCse, 'fixed_slot.manage', res('fixed_slot', { departmentId: CSE }))).toBe(false);
  });

  it("assigns any faculty to their own department's cohorts", () => {
    const assignment = res('teaching_assignment', {
      departmentId: CSE,
      facultyDepartmentIds: [AS, CSE],
    });
    expect(can(hodCse, 'teaching.manage', assignment)).toBe(true);
  });
});

describe('service-department hod', () => {
  it('assigns their own faculty to another department’s cohort', () => {
    const maths = res('teaching_assignment', { departmentId: CSE, facultyDepartmentIds: [AS] });
    expect(can(hodAs, 'teaching.manage', maths)).toBe(true);
  });

  it('cannot assign faculty of other departments', () => {
    const mixed = res('teaching_assignment', {
      departmentId: CSE,
      facultyDepartmentIds: [AS, CSE],
    });
    const cseOnly = res('teaching_assignment', { departmentId: CSE, facultyDepartmentIds: [CSE] });
    expect(can(hodAs, 'teaching.manage', mixed)).toBe(false);
    expect(can(hodAs, 'teaching.manage', cseOnly)).toBe(false);
  });

  it('cannot edit an assignment with no faculty yet in another department', () => {
    const empty = res('teaching_assignment', { departmentId: CSE, facultyDepartmentIds: [] });
    expect(can(hodAs, 'teaching.manage', empty)).toBe(false);
  });

  it('the faculty rule does not leak into other actions', () => {
    // facultyDepartmentIds only widens the scope check; the action must still be granted.
    expect(
      can(
        hodAs,
        'fixed_slot.manage',
        res('fixed_slot', { departmentId: CSE, facultyDepartmentIds: [AS] }),
      ),
    ).toBe(false);
  });
});

describe('timetable_coordinator', () => {
  it('edits teaching assignments, fixed slots and timetable scope in their department', () => {
    expect(
      can(coordCse, 'teaching.manage', res('teaching_assignment', { departmentId: CSE })),
    ).toBe(true);
    expect(can(coordCse, 'fixed_slot.manage', res('fixed_slot', { departmentId: CSE }))).toBe(true);
    expect(
      can(coordCse, 'timetable_scope.manage', res('timetable_scope', { departmentId: CSE })),
    ).toBe(true);
  });

  it('not in another department, and not institute-wide fixed slots', () => {
    expect(
      can(coordCse, 'teaching.manage', res('teaching_assignment', { departmentId: ECE })),
    ).toBe(false);
    expect(can(coordCse, 'fixed_slot.manage', res('fixed_slot', { departmentId: null }))).toBe(
      false,
    );
  });

  it('an institute coordinator covers every department', () => {
    expect(can(coordInst, 'fixed_slot.manage', res('fixed_slot'))).toBe(true);
    expect(
      can(coordInst, 'teaching.manage', res('teaching_assignment', { departmentId: ECE })),
    ).toBe(true);
  });

  it('does not edit master data such as sections or faculty', () => {
    expect(can(coordInst, 'cohort.manage', res('section', { departmentId: CSE }))).toBe(false);
    expect(can(coordInst, 'faculty.manage', res('faculty', { departmentId: CSE }))).toBe(false);
  });
});

describe('faculty', () => {
  const own = res('faculty', { departmentId: CSE, ownerUserId: facultyKaur.id });
  const colleague = res('faculty', { departmentId: CSE, ownerUserId: 'user-other' });

  it('edits only their own availability', () => {
    expect(can(facultyKaur, 'faculty.availability.edit', own)).toBe(true);
    expect(can(facultyKaur, 'faculty.availability.edit', colleague)).toBe(false);
    expect(
      can(
        facultyKaur,
        'faculty.availability.edit',
        res('faculty', { departmentId: CSE, ownerUserId: null }),
      ),
    ).toBe(false);
  });

  it('not their own record in another institute', () => {
    expect(
      can(facultyKaur, 'faculty.availability.edit', {
        type: 'faculty',
        instituteId: OTHER_INST,
        ownerUserId: facultyKaur.id,
      }),
    ).toBe(false);
  });

  it('cannot edit anything else about their record', () => {
    expect(can(facultyKaur, 'faculty.manage', own)).toBe(false);
  });

  it('the hod can edit a faculty member’s availability in their department', () => {
    expect(can(hodCse, 'faculty.availability.edit', colleague)).toBe(true);
  });

  it('canSomewhere lets faculty reach their own availability page', () => {
    expect(canSomewhere(facultyKaur, 'faculty.availability.edit', { id: INST })).toBe(true);
    expect(canSomewhere(examCoord, 'faculty.availability.edit', { id: INST })).toBe(false);
  });
});

describe('readiness and imports', () => {
  it('admin, hod and coordinator see readiness; faculty and students do not', () => {
    expect(can(admin, 'readiness.view', res('term'))).toBe(true);
    expect(can(hodAs, 'readiness.view', res('term'))).toBe(true);
    expect(can(coordCse, 'readiness.view', res('term'))).toBe(true);
    expect(can(facultyKaur, 'readiness.view', res('term'))).toBe(false);
    expect(can(student, 'readiness.view', res('term'))).toBe(false);
  });

  it('faculty cannot start imports', () => {
    expect(canSomewhere(facultyKaur, 'import.run', { id: INST })).toBe(false);
    expect(canSomewhere(hodCse, 'import.run', { id: INST })).toBe(true);
  });
});
