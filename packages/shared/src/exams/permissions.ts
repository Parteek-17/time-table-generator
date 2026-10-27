import type { Action } from '../auth/permissions';

/**
 * Actions P6 checks with can() (API) and me.may() (web). Until INT adds `exam.view` /
 * `exam.manage` to auth/permissions.ts (requests/2026-10-27-p6-exam-permissions.md), they map
 * onto existing actions: staff who read master data read date sheets and seating, and only
 * institute admins change them. Swap these two lines when the request is merged.
 */
export const EXAM_VIEW: Action = 'masterdata.view';
export const EXAM_MANAGE: Action = 'institute.manage';
