import { describe, it, expect } from 'vitest';
import {
  buildContext, formatContext, cosine, topK, retrieveChunks, textHash, normalizeQuote, verifyFacts, selectEmail,
  MAX_CONTEXT_CHARS, TOP_K_PER_QUERY, type ContextChunk, type Embedder, type EmbeddingStore,
} from './ground';
import type { GroundedFact, GroundedFacts } from '../../types';

const chunk = (id: string, text: string, source_type: ContextChunk['source_type'] = 'website'): ContextChunk =>
  ({ id, source_type, source_url: `https://x.kr/${id}`, text });

const fact = <V extends string | string[]>(over: Partial<GroundedFact<V>>): GroundedFact<V> =>
  ({ value: null, status: 'not_found', chunk_id: null, quote: null, source_url: null, source_type: null, verification: null, ...over });

const facts = (over: Partial<GroundedFacts> = {}): GroundedFacts => ({
  age_range: fact({}), approx_students: fact({}), cefr_levels: fact({}), hook: fact({}), ...over,
});

describe('verifyFacts', () => {
  const chunks = [chunk('a#0', '저희 학원은 만 3~5세 유아를 대상으로 합니다.'), chunk('b#0', '학부모 후기: 아이가 좋아해요', 'blog_third_party')];

  it('passes an exact quote and fills source fields from the chunk', () => {
    const r = verifyFacts(facts({ age_range: fact({ value: '3–5세', status: 'sourced', chunk_id: 'a#0', quote: '만 3~5세 유아를 대상으로' }) }), chunks);
    expect(r.failures).toBe(0);
    expect(r.facts.age_range).toMatchObject({ verification: 'passed', source_url: 'https://x.kr/a#0', source_type: 'website', status: 'sourced' });
  });
  it('ignores whitespace differences', () => {
    const r = verifyFacts(facts({ age_range: fact({ value: '3–5세', status: 'sourced', chunk_id: 'a#0', quote: '만  3~5세\n유아를   대상으로' }) }), chunks);
    expect(r.facts.age_range.verification).toBe('passed');
  });
  it('accepts a full-width digit quote', () => {
    const c = [chunk('a#0', '만 3~5세 대상')];
    const r = verifyFacts(facts({ age_range: fact({ value: '3–5', status: 'sourced', chunk_id: 'a#0', quote: '만 ３~５세 대상' }) }), c);
    expect(r.facts.age_range.verification).toBe('passed');
  });
  it('rejects a quote taken from a different chunk', () => {
    const r = verifyFacts(facts({ age_range: fact({ value: '3–5세', status: 'sourced', chunk_id: 'b#0', quote: '만 3~5세 유아를 대상으로' }) }), chunks);
    expect(r.failures).toBe(1);
    expect(r.facts.age_range).toMatchObject({ status: 'not_found', verification: 'failed', value: null, chunk_id: null });
    expect(r.facts.age_range.rejected?.[0]).toMatchObject({ chunk_id: 'b#0', quote: '만 3~5세 유아를 대상으로' });
  });
  it('rejects an invented chunk_id', () => {
    const r = verifyFacts(facts({ age_range: fact({ value: '3–5세', status: 'sourced', chunk_id: 'zzz#9', quote: '만 3~5세' }) }), chunks);
    expect(r.facts.age_range.verification).toBe('failed');
  });
  it('rejects an invented quote and a missing quote', () => {
    expect(verifyFacts(facts({ age_range: fact({ value: '5', status: 'sourced', chunk_id: 'a#0', quote: '초등학생 전용' }) }), chunks).failures).toBe(1);
    expect(verifyFacts(facts({ age_range: fact({ value: '5', status: 'inferred', chunk_id: 'a#0', quote: null }) }), chunks).failures).toBe(1);
  });
  it('keeps an inferred fact that cites a real quote', () => {
    const r = verifyFacts(facts({ cefr_levels: fact({ value: ['Pre-A1'], status: 'inferred', chunk_id: 'a#0', quote: '만 3~5세 유아' }) }), chunks);
    expect(r.facts.cefr_levels).toMatchObject({ status: 'inferred', verification: 'passed' });
  });
  it('rejects a sourced fact with no value', () =>
    expect(verifyFacts(facts({ approx_students: fact({ value: '', status: 'sourced', chunk_id: 'a#0', quote: '만 3~5세' }) }), chunks).failures).toBe(1));
  it('leaves not_found alone and clean', () => {
    const r = verifyFacts(facts({ age_range: fact({ value: 'junk', chunk_id: 'a#0', quote: 'x' }) }), chunks);
    expect(r.failures).toBe(0);
    expect(r.facts.age_range).toMatchObject({ status: 'not_found', value: null, chunk_id: null, quote: null, verification: null });
  });
  it('rejects a hook that cites a third-party chunk', () => {
    const r = verifyFacts(facts({ hook: fact({ value: '아이가 좋아해요', status: 'sourced', chunk_id: 'b#0', quote: '아이가 좋아해요' }) }), chunks);
    expect(r.failures).toBe(1);
    expect(r.facts.hook).toMatchObject({ status: 'not_found', verification: 'failed' });
    expect(r.facts.hook.rejected?.[0].reason).toContain('third-party');
  });
  it('lets another fact cite a third-party chunk, but not the hook', () => {
    const r = verifyFacts(facts({ age_range: fact({ value: '유아', status: 'inferred', chunk_id: 'b#0', quote: '아이가 좋아해요' }) }), chunks);
    expect(r.facts.age_range.verification).toBe('passed');
  });
  it('accepts a hook from an own blog', () => {
    const own = [chunk('c#0', '2026 겨울방학 특강을 엽니다', 'blog_own')];
    const r = verifyFacts(facts({ hook: fact({ value: '겨울방학 특강', status: 'sourced', chunk_id: 'c#0', quote: '겨울방학 특강을 엽니다' }) }), own);
    expect(r.facts.hook.verification).toBe('passed');
  });
});

describe('normalizeQuote', () => {
  it('maps full-width characters and collapses whitespace', () => expect(normalizeQuote(' ＡＢＣ １２３\n x ')).toBe('ABC 123 x'));
});

describe('selectEmail', () => {
  it('prefers an own-source email over a third-party one', () =>
    expect(selectEmail([
      { email: 'blogger@gmail.com', sourceId: '1', sourceType: 'blog_third_party' },
      { email: 'info@academy.kr', sourceId: '2', sourceType: 'website' },
    ])).toEqual({ email: 'info@academy.kr', email_confidence: 'scraped' }));
  it('takes the first own-source email', () =>
    expect(selectEmail([
      { email: 'a@x.kr', sourceId: '1', sourceType: 'blog_own' },
      { email: 'b@x.kr', sourceId: '2', sourceType: 'website' },
    ]).email).toBe('a@x.kr'));
  it('never constructs an address', () => {
    expect(selectEmail([{ email: 'blogger@gmail.com', sourceId: '1', sourceType: 'blog_third_party' }])).toEqual({ email: '', email_confidence: 'unknown' });
    expect(selectEmail([])).toEqual({ email: '', email_confidence: 'unknown' });
    expect(selectEmail(undefined)).toEqual({ email: '', email_confidence: 'unknown' });
  });
  it('does not trust an entry with no sourceType', () =>
    expect(selectEmail([{ email: 'old@x.kr', sourceId: '1' } as any]).email).toBe(''));
});

describe('buildContext', () => {
  const src = (type: any, id: string, texts: string[], status: 'ok' | 'error' = 'ok') =>
    ({ status, type, url: `https://${id}.kr`, chunks: texts.map((t, i) => ({ id: `${id}#${i}`, text: t })) });

  it('orders own blog, then website, then third-party, and skips failed sources', () => {
    const r = buildContext([
      src('blog_third_party', 'p', ['parent']),
      src('website', 'w', ['site']),
      src('blog_own', 'o', ['own']),
      src('website', 'bad', ['x'], 'error'),
    ], 'grounded_full');
    expect(r.chunks.map(c => c.id)).toEqual(['o#0', 'w#0', 'p#0']);
    expect(r.dropped).toBe(0);
  });
  it('stops at the character cap and counts the dropped chunks', () => {
    const big = 'x'.repeat(MAX_CONTEXT_CHARS - 100);
    const r = buildContext([src('blog_own', 'o', [big, 'y'.repeat(200), 'tiny'])], 'grounded_full');
    expect(r.chunks.map(c => c.id)).toEqual(['o#0']);
    expect(r.dropped).toBe(2); // stops at the first overflow, even though "tiny" would fit
  });
  it('returns every chunk, uncapped, for retrieval', () => {
    const r = buildContext([src('blog_own', 'o', ['x'.repeat(MAX_CONTEXT_CHARS), 'y'])], 'grounded_retrieval');
    expect(r.chunks).toHaveLength(2);
    expect(r.dropped).toBe(0);
  });
  it('formats each chunk as [chunk_id | source_type] text', () =>
    expect(formatContext([chunk('a#0', '안녕', 'blog_own')])).toBe('[a#0 | blog_own]\n안녕'));
});

describe('cosine and topK', () => {
  it('cosine is 1 for parallel, 0 for orthogonal, 0 for a zero vector', () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
  it('topK returns the k best ids, best first', () =>
    expect(topK([1, 0], [{ id: 'a', vec: [0, 1] }, { id: 'b', vec: [1, 0.1] }, { id: 'c', vec: [1, 1] }], 2)).toEqual(['b', 'c']));
});

describe('retrieveChunks', () => {
  // Embeds a text as [count of 나이, count of 원생]; queries map by keyword.
  const embed: Embedder = async (texts) => texts.map(t => [(t.match(/연령|나이|세/g) || []).length, (t.match(/원생|학생|인원/g) || []).length, 1]);
  it('returns the union of the top chunks per query, in context order, and caches embeddings', async () => {
    const chunks = Array.from({ length: 12 }, (_, i) => chunk(`c#${i}`, i % 2 ? '나이 세 연령' : '원생 학생 인원'));
    const store: EmbeddingStore = {};
    const out = await retrieveChunks(chunks, embed, store);
    expect(out.length).toBeLessThanOrEqual(TOP_K_PER_QUERY * 4);
    expect(out.length).toBeGreaterThan(0);
    expect(out.map(c => c.id)).toEqual(chunks.filter(c => out.includes(c)).map(c => c.id));
    expect(Object.keys(store)).toHaveLength(12);
    let calls = 0;
    await retrieveChunks(chunks, async (t, k) => { calls++; return embed(t, k); }, store);
    expect(calls).toBe(1); // only the queries; every chunk was cached
  });
  it('re-embeds a chunk whose text changed', async () => {
    const store: EmbeddingStore = { 'c#0': { hash: textHash('old'), v: [0, 0, 0] } };
    await retrieveChunks([chunk('c#0', 'new text')], embed, store);
    expect(store['c#0'].hash).toBe(textHash('new text'));
  });
  it('returns nothing for no chunks', async () => expect(await retrieveChunks([], embed, {})).toEqual([]));
});
