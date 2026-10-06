import { describe, it, expect } from 'vitest';
import { queuedLead, cityDistrict, isAwaitingEnrichment } from './queue';
import type { NaverSearchResult } from '../types';

const item = (over: Partial<NaverSearchResult> = {}): NaverSearchResult => ({
  title: '<b>리틀팍스 영어유치원</b>', link: 'http://littlefox.kr', category: '교육,학문>유치원',
  description: '', telephone: '02-111-2222', address: '서울특별시 마포구 상암동 1679',
  roadAddress: '서울특별시 마포구 월드컵로42길 38', mapx: '1', mapy: '2', ...over,
});

describe('queuedLead', () => {
  it('holds what Naver returned and nothing a model would have to guess', () => {
    const q = queuedLead(item());
    expect(q.institution_name_kr).toBe('리틀팍스 영어유치원');
    expect(q.phone).toBe('02-111-2222');
    expect(q.address_full).toBe('서울특별시 마포구 월드컵로42길 38');
    expect(q.enrichment_status).toBe('queued');
    // The fields the old sweep filled in with invented values stay absent.
    expect(q.student_age_range).toBeUndefined();
    expect(q.cefr_levels_taught).toBeUndefined();
    expect(q.email).toBeUndefined();
    expect(q.personalization_hook).toBeUndefined();
  });

  it('carries the English signal so the review queue still works before enrichment', () => {
    expect(queuedLead(item())).toMatchObject({ english_signal: 'confirmed', needs_review: false });
    expect(queuedLead(item({ title: '상암유치원', category: '교육,학문>유치원' })))
      .toMatchObject({ english_signal: 'unsure', needs_review: true });
  });

  it('queues as not_contacted — a sweep never changes outreach state', () => {
    expect(queuedLead(item()).firebase_status).toBe('not_contacted');
  });
});

describe('cityDistrict', () => {
  it('reads city and district off the address, leaving them in Korean', () => {
    expect(cityDistrict('서울특별시 마포구 월드컵로42길 38')).toEqual({ city: '서울특별시', district: '마포구' });
    expect(cityDistrict('경기도 성남시 분당구 정자동 1')).toEqual({ city: '경기도', district: '성남시' });
  });

  it('survives a missing address instead of inventing one', () => {
    expect(cityDistrict(undefined)).toEqual({ city: '', district: '' });
    expect(cityDistrict('서울특별시')).toEqual({ city: '서울특별시', district: '' });
  });
});

describe('isAwaitingEnrichment', () => {
  it('is true for queued and failed, false once enriched or for an older lead', () => {
    expect(isAwaitingEnrichment({ enrichment_status: 'queued' })).toBe(true);
    expect(isAwaitingEnrichment({ enrichment_status: 'failed' })).toBe(true);
    expect(isAwaitingEnrichment({ enrichment_status: 'enriched' })).toBe(false);
    expect(isAwaitingEnrichment({})).toBe(false);
  });
});
