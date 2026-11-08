import { describe, expect, it } from 'vitest';
import { formatDuration, initials } from './format';

describe('formatDuration', () => {
  it('drops the hours when under one hour', () => {
    expect(formatDuration('00:39:30')).toBe('39:30');
  });

  it('keeps hours and fractional seconds (two digits)', () => {
    expect(formatDuration('01:02:03.5000000')).toBe('1:02:03.50');
  });

  it('handles day components and unknown formats', () => {
    expect(formatDuration('1.02:00:00')).toBe('26:00:00');
    expect(formatDuration('n/a')).toBe('n/a');
  });
});

describe('initials', () => {
  it('uses the first two words', () => {
    expect(initials('thandi mokoena dlamini')).toBe('TM');
    expect(initials('  Cher ')).toBe('C');
  });
});
