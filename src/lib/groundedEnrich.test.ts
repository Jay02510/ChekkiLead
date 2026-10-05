import { describe, it, expect } from 'vitest';
import { enrichGroundedServer, buildGroundedLead } from './groundedEnrich';
import type { NaverSearchResult } from '../types';

const item: NaverSearchResult = {
  title: '테스트영어학원', link: 'https://m.place.naver.com/place/777/home', category: '어학교육>영어교육', description: '',
  telephone: '02-111-2222', address: '서울 강남구 1', roadAddress: '서울 강남구 테헤란로 1', mapx: '0', mapy: '0',
};

const sources = [
  { status: 'ok' as const, type: 'blog_third_party' as const, url: 'https://blog.naver.com/mom/1', chunks: [{ id: 'p#0', text: '엄마 후기: 선생님이 좋아요' }] },
  { status: 'ok' as const, type: 'website' as const, url: 'https://academy.kr', chunks: [{ id: 'w#0', text: '만 5~7세 대상 파닉스반을 운영합니다. 겨울방학 특강 접수 중.' }] },
];

const nf = { value: null, status: 'not_found', chunk_id: null, quote: null };
const modelOut = (facts: any) => ({
  institution_name_en: 'Test English Academy', institution_name_kr: '테스트영어학원', institution_type: 'hagwon',
  city: 'Seoul', district: 'Gangnam-gu', outreach_priority: 4, fit_reason: 'ok', agent_notes: 'n',
  facts: { age_range: nf, approx_students: nf, cefr_levels: nf, hook: nf, ...facts },
});

const fakeAi = (out: any) => ({
  models: { generateContent: async () => ({ text: JSON.stringify(out), usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } }) },
}) as any;

describe('enrichGroundedServer', () => {
  it('verifies facts in code and fills the flat fields from them', async () => {
    const usage: any[] = [];
    const lead = await enrichGroundedServer(item, { sources, candidate_emails: [] }, 'grounded_full', {
      ai: fakeAi(modelOut({
        age_range: { value: '만 5–7세', status: 'sourced', chunk_id: 'w#0', quote: '만 5~7세 대상' },
        hook: { value: '겨울방학 특강', status: 'sourced', chunk_id: 'w#0', quote: '겨울방학 특강 접수 중' },
        cefr_levels: { value: ['Pre-A1'], status: 'inferred', chunk_id: 'w#0', quote: '파닉스반을 운영합니다' },
      })),
      onUsage: u => usage.push(u), now: () => '2026-10-05T00:00:00.000Z',
    });
    expect(lead.student_age_range).toBe('만 5–7세');
    expect(lead.personalization_hook).toBe('겨울방학 특강');
    expect(lead.cefr_levels_taught).toEqual(['Pre-A1']);
    expect(lead.approx_students).toBe('not found');
    expect(lead.facts!.age_range).toMatchObject({ verification: 'passed', source_url: 'https://academy.kr', source_type: 'website' });
    expect(lead.grounding).toEqual({ mode: 'grounded_full', chunks_given: 2, chunks_dropped: 0, verification_failures: 0, enriched_at: '2026-10-05T00:00:00.000Z' });
    expect(usage).toEqual([{ input_tokens: 100, output_tokens: 20, kind: 'generate' }]);
  });

  it('throws away a fabricated quote and counts the failure', async () => {
    const lead = await enrichGroundedServer(item, { sources }, 'grounded_full', {
      ai: fakeAi(modelOut({ age_range: { value: '3–5세', status: 'sourced', chunk_id: 'w#0', quote: '만 3~5세 유아 전문' } })),
    });
    expect(lead.student_age_range).toBe('not found');
    expect(lead.facts!.age_range).toMatchObject({ status: 'not_found', verification: 'failed' });
    expect(lead.grounding!.verification_failures).toBe(1);
  });

  it('never lets the hook come from a parent post', async () => {
    const lead = await enrichGroundedServer(item, { sources }, 'grounded_full', {
      ai: fakeAi(modelOut({ hook: { value: '선생님이 좋아요', status: 'sourced', chunk_id: 'p#0', quote: '선생님이 좋아요' } })),
    });
    expect(lead.personalization_hook).toBe('');
    expect(lead.facts!.hook.verification).toBe('failed');
  });

  it('takes email from an own source in code and never from the model', async () => {
    const out = { ...modelOut({}), email: 'invented@naver.com' };
    const own = await enrichGroundedServer(item, { sources, candidate_emails: [{ email: 'info@academy.kr', sourceId: 'w', sourceType: 'website' }] }, 'grounded_full', { ai: fakeAi(out) });
    expect(own.email).toBe('info@academy.kr');
    expect(own.email_confidence).toBe('scraped');
    const none = await enrichGroundedServer(item, { sources, candidate_emails: [{ email: 'mom@gmail.com', sourceId: 'p', sourceType: 'blog_third_party' }] }, 'grounded_full', { ai: fakeAi(out) });
    expect(none.email).toBe('');
    expect(none.email_confidence).toBe('unknown');
  });

  it('keeps Naver-owned fields from the listing', async () => {
    const lead = await enrichGroundedServer(item, { sources }, 'grounded_full', { ai: fakeAi({ ...modelOut({}), phone: '000', naver_id: 'made_up' }) });
    expect(lead.naver_id).toBe('place_777');
    expect(lead.phone).toBe('02-111-2222');
    expect(lead.address_full).toBe('서울 강남구 테헤란로 1');
    expect(lead.english_signal).toBe('confirmed');
  });

  it('retrieval mode embeds, selects chunks and reports what it left out', async () => {
    const lead = await enrichGroundedServer(item, { sources, embeddings: {} }, 'grounded_retrieval', {
      ai: fakeAi(modelOut({})),
      embed: async texts => texts.map(() => [1, 0, 0]),
    });
    expect(lead.grounding!.mode).toBe('grounded_retrieval');
    expect(lead.grounding!.chunks_given + lead.grounding!.chunks_dropped).toBe(2);
  });

  it('works with no sources: every fact not found', async () => {
    const lead = await enrichGroundedServer(item, { sources: [] }, 'grounded_full', { ai: fakeAi(modelOut({})) });
    expect(lead.student_age_range).toBe('not found');
    expect(lead.grounding!.chunks_given).toBe(0);
  });

  it('stops on a quota error instead of retrying it as malformed', async () => {
    const ai = { models: { generateContent: async () => { throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 }); } } } as any;
    await expect(enrichGroundedServer(item, { sources }, 'grounded_full', { ai })).rejects.toMatchObject({ quota: true });
  });
});

describe('buildGroundedLead', () => {
  it('treats an unknown status as not_found', () => {
    const lead = buildGroundedLead(item, modelOut({ age_range: { value: '5', status: 'maybe', chunk_id: 'w#0', quote: '만 5' } }), { chunks: [], dropped: 0 }, [], 'grounded_full');
    expect(lead.facts!.age_range.status).toBe('not_found');
  });
});
