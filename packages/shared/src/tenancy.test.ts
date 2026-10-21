import { describe, expect, it } from 'vitest';
import { parseInstituteSlug } from './tenancy';

describe('parseInstituteSlug()', () => {
  it('reads the subdomain in dev and production', () => {
    expect(parseInstituteSlug('demo.localhost:3000', 'localhost')).toBe('demo');
    expect(parseInstituteSlug('demo.slotwise.app', 'slotwise.app')).toBe('demo');
    expect(parseInstituteSlug('DEMO.Localhost:3000', 'localhost')).toBe('demo');
  });

  it('returns null for the bare root domain', () => {
    expect(parseInstituteSlug('localhost:3000', 'localhost')).toBeNull();
    expect(parseInstituteSlug('slotwise.app', 'slotwise.app')).toBeNull();
  });

  it('rejects nested, reserved, invalid or foreign hosts', () => {
    expect(parseInstituteSlug('a.b.localhost', 'localhost')).toBeNull();
    expect(parseInstituteSlug('www.slotwise.app', 'slotwise.app')).toBeNull();
    expect(parseInstituteSlug('-bad.localhost', 'localhost')).toBeNull();
    expect(parseInstituteSlug('demo.evil.com', 'slotwise.app')).toBeNull();
    expect(parseInstituteSlug(null, 'localhost')).toBeNull();
  });
});
