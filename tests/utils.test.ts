import { describe, it, expect } from 'vitest';
import { isRecord } from '../src/utils.js';

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
  });

  it('returns true for objects with properties', () => {
    expect(isRecord({ key: 'value', num: 42 })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRecord(undefined)).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  it('returns false for strings', () => {
    expect(isRecord('hello')).toBe(false);
  });

  it('returns false for numbers', () => {
    expect(isRecord(42)).toBe(false);
  });

  it('returns false for booleans', () => {
    expect(isRecord(true)).toBe(false);
  });

  it('returns false for Date instances', () => {
    expect(isRecord(new Date())).toBe(true);
  });
});
