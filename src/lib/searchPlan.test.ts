import { describe, it, expect } from 'vitest';
import { NEIGHBOURHOODS, KEYWORDS, buildQueries, districts } from './searchPlan';

describe('search plan', () => {
  it('covers the five target districts', () => {
    expect(districts().sort()).toEqual(['강남구', '마포구', '분당구', '서초구', '송파구']);
  });

  it('has 6-10 neighbourhoods per district', () => {
    for (const d of districts()) {
      const n = NEIGHBOURHOODS.filter(x => x.district === d).length;
      expect(n, d).toBeGreaterThanOrEqual(6);
      expect(n, d).toBeLessThanOrEqual(10);
    }
  });

  it('has no duplicate neighbourhoods', () => {
    const keys = NEIGHBOURHOODS.map(n => `${n.district} ${n.dong}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('builds one query per neighbourhood and keyword, as "district dong keyword"', () => {
    const queries = buildQueries();
    expect(queries.length).toBe(NEIGHBOURHOODS.length * KEYWORDS.length);
    expect(queries[0]).toBe(`${NEIGHBOURHOODS[0].district} ${NEIGHBOURHOODS[0].dong} ${KEYWORDS[0]}`);
    expect(new Set(queries).size).toBe(queries.length);
  });

  it('always names a 동 — a district-only query returns the same top 5 large academies', () => {
    for (const q of buildQueries()) {
      expect(q, q).toMatch(/동 /);
    }
  });
});
