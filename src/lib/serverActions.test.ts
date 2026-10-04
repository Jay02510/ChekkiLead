// Smoke test — run with: npx tsx src/lib/serverActions.test.ts
// Verifies the legally-required parts of Korea's 정보통신망법 Article 50
// commercial-email footer are always present, regardless of what the model returns.
import assert from 'node:assert';
import { applyEmailCompliance, applyNaverTruth } from './serverActions';
import { EmailDraft, EnrichedLead, NaverSearchResult } from '../types';

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

assert.ok(result.subject_line_kr.startsWith('(광고)'), 'subject must carry the (광고) label');
assert.ok(result.subject_combined.startsWith('(광고)'), 'combined subject must carry the (광고) label');
assert.ok(result.subject_line_kr_b.startsWith('(광고)'), 'subject variant B must carry the (광고) label');
assert.ok(result.subject_combined_b.startsWith('(광고)'), 'combined subject variant B must carry the (광고) label');
assert.ok(result.body_korean.includes('수신거부'), 'Korean body must include an opt-out method');
assert.ok(result.body_korean.includes('contact@chekkiai.com'), 'Korean body must include sender contact');
assert.ok(result.body_english.includes('unsubscribe'), 'English body must include an opt-out method');
assert.ok(result.body_korean.startsWith('안녕하세요.'), 'original personalised body must be preserved');

// applyNaverTruth: the model must never be trusted for fields the code
// already knows from the raw Naver result (naver_id, phone, address,
// firebase_status) — altering naver_id would break dedupe.
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

assert.strictEqual(corrected.naver_id, 'place_123456', "naver_id must come from the raw Naver link, not the model");
assert.strictEqual(corrected.phone, '02-1234-5678', "phone must come from the raw Naver result, not the model");
assert.strictEqual(corrected.address_full, '서울 강남구 테헤란로 1', "address_full must come from the raw Naver result, not the model");
assert.strictEqual(corrected.firebase_status, 'not_contacted', "firebase_status must always start as not_contacted, never whatever the model returned");

console.log('serverActions.test.ts OK');
