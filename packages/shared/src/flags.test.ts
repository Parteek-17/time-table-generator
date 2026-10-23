import { describe, expect, it } from 'vitest';
import { flagStates, isFlagOn } from './flags';

describe('isFlagOn', () => {
  it('is on by default outside production', () => {
    expect(isFlagOn('P2T', { NODE_ENV: 'development' })).toBe(true);
    expect(isFlagOn('P2T', { NODE_ENV: 'test' })).toBe(true);
    expect(isFlagOn('P2T', {})).toBe(true);
  });

  it('is off by default in production', () => {
    expect(isFlagOn('P2T', { NODE_ENV: 'production' })).toBe(false);
  });

  it('follows FLAG_<STREAM> when set', () => {
    expect(isFlagOn('P4', { NODE_ENV: 'production', FLAG_P4: '1' })).toBe(true);
    expect(isFlagOn('P4', { NODE_ENV: 'production', FLAG_P4: 'true' })).toBe(true);
    expect(isFlagOn('P4', { NODE_ENV: 'development', FLAG_P4: '0' })).toBe(false);
    expect(isFlagOn('P4', { NODE_ENV: 'development', FLAG_P4: 'false' })).toBe(false);
  });

  it('lists every flag', () => {
    expect(flagStates({ NODE_ENV: 'production', FLAG_P6: '1' })).toEqual({
      UI: false,
      P2T: false,
      P4: false,
      P5: false,
      P6: true,
      P7: false,
    });
  });
});
