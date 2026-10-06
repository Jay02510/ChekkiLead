import { describe, it, expect } from 'vitest';
import { hookForDraft, draftUsesHook, hookTokens, hookInstruction } from './groundedDraft';
import type { EnrichedLead, GroundedFact, GroundedFacts } from '../types';

const notFound = <V>(): GroundedFact<V> => ({ value: null, status: 'not_found', chunk_id: null, quote: null, source_url: null, source_type: null, verification: null });

const facts = (hook: Partial<GroundedFact<string>>): GroundedFacts => ({
  age_range: notFound<string>(), approx_students: notFound<string>(), cefr_levels: notFound<string[]>(),
  hook: { ...notFound<string>(), ...hook },
});

const lead = (over: Partial<EnrichedLead> = {}): EnrichedLead => ({
  institution_name_en: 'Yeona', institution_name_kr: '여나유치원', institution_type: 'kindergarten',
  city: 'Seoul', district: 'Seocho-gu', email: '', email_confidence: 'unknown', phone: '02-536-1116',
  naver_id: 'hash_1', student_age_range: '', approx_students: '', outreach_priority: 3,
  fit_reason: '', firebase_status: 'not_contacted', ...over,
});

describe('hookForDraft', () => {
  it('uses a verified grounded fact, keeping its source', () => {
    const hook = hookForDraft(lead({ facts: facts({ value: '원어민 교사와 매일 아침 파닉스 활동', status: 'sourced', verification: 'passed', source_url: 'http://x.kr/program', source_type: 'website', quote: '매일 아침 파닉스' }) }));
    expect(hook).toEqual({ text: '원어민 교사와 매일 아침 파닉스 활동', source_type: 'website', source_url: 'http://x.kr/program', quote: '매일 아침 파닉스' });
  });

  it('refuses a fact that failed or skipped quote verification', () => {
    expect(hookForDraft(lead({ facts: facts({ value: '원어민 교사 상주', status: 'sourced', verification: 'failed' }) }))).toBeNull();
    expect(hookForDraft(lead({ facts: facts({ value: '원어민 교사 상주', status: 'sourced', verification: null }) }))).toBeNull();
    expect(hookForDraft(lead({ facts: facts({}) }))).toBeNull();
  });

  it('prefers a hook a person typed in, and records it as manual', () => {
    const hook = hookForDraft(lead({
      personalization_hook: '원장님이 직접 영어 동화 수업을 하십니다',
      manual_fields: ['personalization_hook'],
      facts: facts({ value: '파닉스 활동', status: 'sourced', verification: 'passed', source_type: 'website', source_url: 'http://x.kr' }),
    }));
    expect(hook?.source_type).toBe('manual');
    expect(hook?.source_url).toBeNull();
    expect(hook?.text).toBe('원장님이 직접 영어 동화 수업을 하십니다');
  });

  it('ignores a hook field nobody vouched for', () => {
    expect(hookForDraft(lead({ personalization_hook: 'A well-regarded academy in Seocho' }))).toBeNull();
  });
});

describe('draftUsesHook', () => {
  const hook = { text: '원어민 교사와 매일 아침 파닉스 활동', source_type: 'website' as const, source_url: 'http://x.kr', quote: null };

  it('passes a draft built from the hook', () => {
    expect(draftUsesHook({
      body_korean: '여나유치원에서 원어민 교사와 매일 아침 파닉스 활동을 하신다는 것을 보았습니다.',
      body_english: 'I noticed your morning phonics activity with a native-speaker teacher.',
    }, hook)).toBe(true);
  });

  it('fails a draft that dropped the hook for a generic opener', () => {
    expect(draftUsesHook({
      body_korean: '서초구에서 좋은 유치원을 운영하고 계신다고 들었습니다.',
      body_english: 'I hear you run a well-regarded kindergarten in Seocho.',
    }, hook)).toBe(false);
  });

  it('is not fooled by the words every school shares', () => {
    // 유치원, 수업, 교육 are stopwords: reusing only those is not the hook.
    expect(draftUsesHook({ body_korean: '유치원 수업과 교육에 대해', body_english: 'about kindergarten lessons' }, hook)).toBe(false);
    expect(hookTokens('유치원 수업 교육')).toEqual([]);
  });

  it('strips particles so 파닉스를 counts as 파닉스', () => {
    expect(hookTokens('파닉스를 매일')).toEqual(['파닉스', '매일']);
  });
});

describe('hookInstruction', () => {
  it('names the source and forbids any other claim', () => {
    const text = hookInstruction({ text: '매일 아침 파닉스', source_type: 'blog_own', source_url: 'http://x.kr/1', quote: '매일 아침 파닉스 활동' });
    expect(text).toContain('매일 아침 파닉스');
    expect(text).toContain('http://x.kr/1');
    expect(text).toContain('매일 아침 파닉스 활동');
    expect(text).toMatch(/no student numbers/);
  });

  it('says so when a person vouched for it instead of a page', () => {
    expect(hookInstruction({ text: 'x', source_type: 'manual', source_url: null, quote: null }))
      .toContain('A person at Chekki verified this themselves.');
  });
});
