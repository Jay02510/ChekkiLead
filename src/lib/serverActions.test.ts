import { describe, it, expect } from 'vitest';
import { applyEmailCompliance, applyNaverTruth } from './serverActions';
import { EmailDraft, EnrichedLead, NaverSearchResult } from '../types';

describe('applyEmailCompliance', () => {
  // Verifies the legally-required parts of Korea's 정보통신망법 Article 50
  // commercial-email footer are always present, regardless of what the model returns.
  const draft: EmailDraft = {
    subject_line_kr: '테스트 제목',
    subject_line_en: 'Test subject',
    subject_combined: '테스트 제목 | Test subject',
    subject_line_kr_b: '테스트 제목 B',
    subject_line_en_b: 'Test subject B',
    subject_combined_b: '테스트 제목 B | Test subject B',
    body_korean: '안녕하세요.',
    body_english: 'Hello.',
    cta_primary: 'https://ai-readiness.chekkiai.com',
    personalisation_note: 'n/a',
    institution_type_targeted: 'hagwon',
  };

  const result = applyEmailCompliance(draft);

  it('labels both subject variants with (광고)', () => {
    expect(result.subject_line_kr.startsWith('(광고)')).toBe(true);
    expect(result.subject_combined.startsWith('(광고)')).toBe(true);
    expect(result.subject_line_kr_b.startsWith('(광고)')).toBe(true);
    expect(result.subject_combined_b.startsWith('(광고)')).toBe(true);
  });

  it('includes an opt-out method and sender contact in the Korean body', () => {
    expect(result.body_korean).toContain('수신거부');
    expect(result.body_korean).toContain('contact@chekkiai.com');
  });

  it('includes an opt-out method in the English body', () => {
    expect(result.body_english).toContain('unsubscribe');
  });

  it('preserves the original personalised body', () => {
    expect(result.body_korean.startsWith('안녕하세요.')).toBe(true);
  });
});

describe('applyNaverTruth', () => {
  // The model must never be trusted for fields the code already knows from
  // the raw Naver result (naver_id, phone, address, firebase_status) —
  // altering naver_id would break dedupe.
  const naverItem: NaverSearchResult = {
    title: 'Test Academy',
    link: 'https://m.place.naver.com/place/123456/home',
    category: '학원',
    description: '',
    telephone: '02-1234-5678',
    address: '서울 강남구 테헤란로 1',
    roadAddress: '서울 강남구 테헤란로 1',
    mapx: '0',
    mapy: '0',
  };

  const modelTampered: EnrichedLead = {
    institution_name_en: 'Test Academy',
    institution_name_kr: '테스트 학원',
    institution_type: 'hagwon',
    city: 'Seoul',
    district: '강남구',
    address_full: '잘못된 주소',
    email: 'test@example.com',
    email_confidence: 'estimated',
    phone: '000-0000-0000',
    naver_id: 'made_up_id_the_model_invented',
    student_age_range: '7-12',
    approx_students: '100',
    outreach_priority: 5,
    fit_reason: 'n/a',
    firebase_status: 'sent',
  };

  const corrected = applyNaverTruth(naverItem, modelTampered);

  it('takes naver_id from the raw Naver link, not the model', () => {
    expect(corrected.naver_id).toBe('place_123456');
  });

  it('takes phone from the raw Naver result, not the model', () => {
    expect(corrected.phone).toBe('02-1234-5678');
  });

  it('takes address_full from the raw Naver result, not the model', () => {
    expect(corrected.address_full).toBe('서울 강남구 테헤란로 1');
  });

  it('always resets firebase_status to not_contacted', () => {
    expect(corrected.firebase_status).toBe('not_contacted');
  });

  it('keeps the raw Naver item so the lead can be re-enriched later', () => {
    expect(corrected.naver_raw).toEqual(naverItem);
  });

  it('sets the English signal in code, and sends an unconfirmed lead to review', () => {
    expect(corrected.english_signal).toBe('unsure');
    expect(corrected.needs_review).toBe(true);
  });

  it('does not review a lead whose listing names English, whatever the model says', () => {
    const named = applyNaverTruth({ ...naverItem, title: 'Test 영어학원' }, { ...modelTampered, needs_review: true, english_signal: 'unsure' });
    expect(named.english_signal).toBe('confirmed');
    expect(named.needs_review).toBe(false);
  });
});
