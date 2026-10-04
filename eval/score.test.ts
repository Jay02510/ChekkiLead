import { describe, it, expect } from 'vitest';
import { parseAgeRange, ageIoU, jaccard, sameEmail } from './score';

describe('parseAgeRange', () => {
  it('parses en-dash ranges', () => expect(parseAgeRange('5–12 years')).toEqual([5, 12]));
  it('parses a single age', () => expect(parseAgeRange('7 years')).toEqual([7, 7]));
  it('returns null for no numbers', () => expect(parseAgeRange('children')).toBeNull());
});

describe('ageIoU', () => {
  it('scores an exact match as 1', () => expect(ageIoU([5, 12], [5, 12])).toBe(1));
  it('scores a single-age exact match as 1', () => expect(ageIoU([7, 7], [7, 7])).toBe(1));
  it('scores disjoint ranges as 0', () => expect(ageIoU([3, 5], [10, 12])).toBe(0));
  it('scores partial overlap between 0 and 1', () => expect(ageIoU([5, 12], [8, 15])).toBeCloseTo(5 / 11));
  it('scores an unparseable prediction as 0', () => expect(ageIoU(null, [5, 12])).toBe(0));
});

describe('jaccard', () => {
  it('scores identical sets as 1', () => expect(jaccard(['A1', 'A2'], ['A2', 'A1'])).toBe(1));
  it('scores partial overlap', () => expect(jaccard(['A1', 'A2'], ['A2', 'B1'])).toBeCloseTo(1 / 3));
  it('treats a missing prediction as empty', () => expect(jaccard(undefined, ['A1'])).toBe(0));
});

describe('sameEmail', () => {
  it('ignores case and whitespace', () => expect(sameEmail(' Info@Academy.kr ', 'info@academy.kr')).toBe(true));
  it('rejects a different address', () => expect(sameEmail('a@x.kr', 'b@x.kr')).toBe(false));
});
