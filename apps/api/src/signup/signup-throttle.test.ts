import { describe, expect, it } from 'vitest';
import { SignupThrottle } from './signup-throttle';

describe('SignupThrottle', () => {
  it('allows a few sign-ups per email per day', () => {
    const t = new SignupThrottle({ max: 2, windowMs: 1000 }, { max: 100, windowMs: 1000 });
    expect(t.allow('a@x.test', 0)).toBe(true);
    expect(t.allow('a@x.test', 10)).toBe(true);
    expect(t.allow('a@x.test', 20)).toBe(false);
    expect(t.allow('b@x.test', 20)).toBe(true);
    expect(t.allow('a@x.test', 1500)).toBe(true);
  });

  it('caps sign-ups across everyone', () => {
    const t = new SignupThrottle({ max: 10, windowMs: 1000 }, { max: 2, windowMs: 1000 });
    expect(t.allow('a@x.test', 0)).toBe(true);
    expect(t.allow('b@x.test', 0)).toBe(true);
    expect(t.allow('c@x.test', 0)).toBe(false);
  });
});
