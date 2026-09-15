// Smoke test — run with: npx tsx src/lib/serverActions.test.ts
// Verifies the legally-required parts of Korea's 정보통신망법 Article 50
// commercial-email footer are always present, regardless of what the model returns.
import assert from 'node:assert';
import { applyEmailCompliance } from './serverActions';
import { EmailDraft } from '../types';

const draft: EmailDraft = {
  subject_line_kr: '테스트 제목',
  subject_line_en: 'Test subject',
  subject_combined: '테스트 제목 | Test subject',
  body_korean: '안녕하세요.',
  body_english: 'Hello.',
  cta_primary: 'https://ai-readiness.chekkiai.com',
  personalisation_note: 'n/a',
  institution_type_targeted: 'hagwon',
};

const result = applyEmailCompliance(draft);

assert.ok(result.subject_line_kr.startsWith('(광고)'), 'subject must carry the (광고) label');
assert.ok(result.subject_combined.startsWith('(광고)'), 'combined subject must carry the (광고) label');
assert.ok(result.body_korean.includes('수신거부'), 'Korean body must include an opt-out method');
assert.ok(result.body_korean.includes('contact@chekkiai.com'), 'Korean body must include sender contact');
assert.ok(result.body_english.includes('unsubscribe'), 'English body must include an opt-out method');
assert.ok(result.body_korean.startsWith('안녕하세요.'), 'original personalised body must be preserved');

console.log('serverActions.test.ts OK');
