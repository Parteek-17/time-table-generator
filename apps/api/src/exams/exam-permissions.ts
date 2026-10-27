import { EXAM_MANAGE as MANAGE, EXAM_VIEW as VIEW } from '@slotwise/shared/exams';

// P6's permission mapping lives in @slotwise/shared/exams (permissions.ts) so the web uses it
// too. Fail at start-up rather than run routes with an undefined permission (the guard would
// then let anyone through), e.g. when packages/shared was not rebuilt.
if (!MANAGE || !VIEW) throw new Error('Exam permissions missing: rebuild packages/shared.');

export const EXAM_MANAGE = MANAGE;
export const EXAM_VIEW = VIEW;
