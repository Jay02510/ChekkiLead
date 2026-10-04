import { describe, it, expect } from 'vitest';
import { getNaverId, stripHtml } from './naverId';
import { NaverSearchResult } from '../types';

function result(overrides: Partial<NaverSearchResult>): NaverSearchResult {
  return {
    title: '', link: '', category: '', description: '', telephone: '',
    address: '', roadAddress: '', mapx: '', mapy: '', ...overrides,
  };
}

describe('getNaverId', () => {
  it('prefers the Naver place ID over everything else', () => {
    expect(getNaverId(result({ link: 'https://m.place.naver.com/place/123456/home' }))).toBe('place_123456');
  });

  it('falls back to phone when there is no place link', () => {
    expect(getNaverId(result({ telephone: '02-1234-5678' }))).toBe('phone_0212345678');
  });

  it('is stable across queries where only a floor suffix differs', () => {
    const a = getNaverId(result({ title: '<b>애플</b>영어학원', roadAddress: '서울특별시 강남구 테헤란로 1 3층' }));
    const b = getNaverId(result({ title: '애플영어학원', roadAddress: '서울특별시 강남구 테헤란로 1' }));
    expect(a).toBe(b);
  });

  it('differs for a genuinely different address', () => {
    const a = getNaverId(result({ title: '애플영어학원', roadAddress: '서울특별시 강남구 테헤란로 1' }));
    const c = getNaverId(result({ title: '애플영어학원', roadAddress: '서울특별시 서초구 다른로 9' }));
    expect(a).not.toBe(c);
  });
});

describe('stripHtml', () => {
  it('removes HTML tags from Naver titles', () => {
    expect(stripHtml('<b>애플</b>영어학원')).toBe('애플영어학원');
  });
});
