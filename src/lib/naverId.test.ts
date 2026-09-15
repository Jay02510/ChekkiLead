// Smoke test — run with: npx tsx src/lib/naverId.test.ts
import assert from 'node:assert';
import { getNaverId, stripHtml } from './naverId';
import { NaverSearchResult } from '../types';

function result(overrides: Partial<NaverSearchResult>): NaverSearchResult {
  return {
    title: '', link: '', category: '', description: '', telephone: '',
    address: '', roadAddress: '', mapx: '', mapy: '', ...overrides,
  };
}

// place ID takes priority over everything else
assert.strictEqual(
  getNaverId(result({ link: 'https://m.place.naver.com/place/123456/home' })),
  'place_123456'
);

// phone is used when no place link
assert.strictEqual(
  getNaverId(result({ telephone: '02-1234-5678' })),
  'phone_0212345678'
);

// same business, address differs only by floor suffix across two queries -> same hash
const a = getNaverId(result({ title: '<b>애플</b>영어학원', roadAddress: '서울특별시 강남구 테헤란로 1 3층' }));
const b = getNaverId(result({ title: '애플영어학원', roadAddress: '서울특별시 강남구 테헤란로 1' }));
assert.strictEqual(a, b, 'floor-suffix variance should not fork the dedupe key');

// different address -> different hash
const c = getNaverId(result({ title: '애플영어학원', roadAddress: '서울특별시 서초구 다른로 9' }));
assert.notStrictEqual(a, c);

assert.strictEqual(stripHtml('<b>애플</b>영어학원'), '애플영어학원');

console.log('naverId.test.ts OK');
