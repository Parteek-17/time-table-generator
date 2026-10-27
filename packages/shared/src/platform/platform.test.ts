import { describe, expect, it } from 'vitest';
import {
  checkLimit,
  PLANS,
  setPlanSchema,
  signupSchema,
  suggestSlug,
  trialDaysLeft,
  trialEndDate,
  usageReport,
} from './index';

describe('plan limits', () => {
  it('allows up to the limit and refuses beyond it', () => {
    expect(checkLimit(PLANS.trial, 'departments', 2).ok).toBe(true);
    expect(checkLimit(PLANS.trial, 'departments', 3)).toMatchObject({ ok: false, remaining: 0 });
    expect(checkLimit(PLANS.trial, 'students', 790, 20).ok).toBe(false);
  });

  it('null means no limit', () => {
    expect(checkLimit(PLANS.university, 'sections', 10_000)).toMatchObject({
      ok: true,
      remaining: null,
    });
  });

  it('reports nearly full from 80% and full at the limit', () => {
    const report = usageReport(PLANS.trial, {
      departments: 3,
      sections: 10,
      faculty: 10,
      students: 0,
    });
    expect(report.map((r) => r.level)).toEqual(['full', 'near', 'ok', 'ok']);
  });
});

describe('trial dates', () => {
  it('a 30-day trial started on 1 Nov ends on 30 Nov', () => {
    expect(trialEndDate(PLANS.trial, '2026-11-01')).toBe('2026-11-30');
    expect(trialEndDate(PLANS.college, '2026-11-01')).toBeNull();
  });

  it('counts today as a day left, and never goes below zero', () => {
    expect(trialDaysLeft('2026-11-30', '2026-11-30')).toBe(1);
    expect(trialDaysLeft('2026-11-30', '2026-11-01')).toBe(30);
    expect(trialDaysLeft('2026-11-30', '2026-12-05')).toBe(0);
  });
});

describe('signup form', () => {
  const valid = {
    instituteName: 'Demo Institute of Engineering',
    slug: 'Demo-Engg',
    type: 'college',
    affiliatingUniversityName: '',
    adminName: 'Asha Verma',
    adminEmail: 'Admin@Demo-Engg.test',
  };

  it('normalises slug and email, empty university becomes null', () => {
    const parsed = signupSchema.parse(valid);
    expect(parsed).toMatchObject({
      slug: 'demo-engg',
      adminEmail: 'admin@demo-engg.test',
      affiliatingUniversityName: null,
    });
  });

  it('refuses reserved subdomains and a filled-in honeypot', () => {
    expect(signupSchema.safeParse({ ...valid, slug: 'admin' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, website: 'spam.example' }).success).toBe(false);
  });

  it('plan change takes a known plan and a plain date', () => {
    expect(setPlanSchema.safeParse({ planCode: 'college', trialEndsOn: null }).success).toBe(true);
    expect(setPlanSchema.safeParse({ planCode: 'gold' }).success).toBe(false);
    expect(setPlanSchema.safeParse({ planCode: 'trial', trialEndsOn: '30/11/2026' }).success).toBe(
      false,
    );
  });
});

describe('suggestSlug', () => {
  it('builds a subdomain from the name', () => {
    expect(suggestSlug('Demo Institute of Engineering')).toBe('demo-institute-of-engineering');
    expect(suggestSlug('Sample College of Technology & Management')).toBe(
      'sample-college-of-technology',
    );
    expect(suggestSlug('  !!! ')).toBe('');
  });
});
