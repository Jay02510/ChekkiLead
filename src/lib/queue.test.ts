import { describe, it, expect } from 'vitest';
import { queuedLead, cityDistrict, isAwaitingEnrichment, firstEnrichmentUpdate } from './queue';
import type { EnrichedLead, NaverSearchResult } from '../types';

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

describe('firstEnrichmentUpdate', () => {
  const grounded = {
    institution_name_en: 'Little Fox English Kindergarten', institution_name_kr: '리틀팍스 영어유치원',
    institution_type: 'kindergarten', city: 'Seoul', district: 'Mapo-gu',
    address_full: '서울특별시 마포구 월드컵로42길 38', phone: '02-111-2222', website: 'http://littlefox.kr',
    english_signal: 'confirmed', needs_review: false,
    // Fields mergeGrounded already writes — not this function's job.
    student_age_range: '만 3-5세', personalization_hook: '매일 아침 파닉스',
  } as unknown as EnrichedLead;

  it('fills in what a queued record never had', () => {
    const update = firstEnrichmentUpdate(grounded);
    expect(update.institution_name_en).toBe('Little Fox English Kindergarten');
    expect(update.institution_type).toBe('kindergarten');
    expect(update.district).toBe('Mapo-gu');
  });

  it('leaves the grounded fields to mergeGrounded', () => {
    const update = firstEnrichmentUpdate(grounded);
    expect(update.student_age_range).toBeUndefined();
    expect(update.personalization_hook).toBeUndefined();
  });

  it('never overwrites a field a person typed in', () => {
    const update = firstEnrichmentUpdate(grounded, ['phone', 'website']);
    expect(update.phone).toBeUndefined();
    expect(update.website).toBeUndefined();
    expect(update.city).toBe('Seoul');
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
