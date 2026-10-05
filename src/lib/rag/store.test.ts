import { describe, it, expect } from 'vitest';
import { saveSources } from './store';
import type { CollectResult } from './collect';

const fakeDb = () => {
  const ops: any[] = [];
  const doc = (path: string) => ({ path, collection: (name: string) => ({ doc: (id: string) => doc(`${path}/${name}/${id}`) }) });
  const batch = { set: (ref: any, data: any) => ops.push(['set', ref.path, data]), update: (ref: any, data: any) => ops.push(['update', ref.path, data]), commit: async () => { ops.push(['commit']); } };
  const db: any = { collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }), batch: () => batch };
  return { db, ops };
};

const result: CollectResult = {
  sources: [{ id: 'abc123', url: 'https://x.kr', type: 'website', title: 't', postdate: null, via: 'page', status: 'ok', error: null, text: 'hello', chunks: [{ id: 'abc123#0', text: 'hello' }], emails: ['a@x.kr'], fetched_at: 'now' }],
  counts: { blog_own: 0, blog_third_party: 0, website: 1, errors: 0 },
  candidate_emails: [{ email: 'a@x.kr', sourceId: 'abc123', sourceType: 'website' }],
};

describe('saveSources', () => {
  it('writes each source under leads/{id}/sources/{sourceId} without the id field, then updates the lead, in one batch', async () => {
    const { db, ops } = fakeDb();
    await saveSources(db, 'place_1', result);
    expect(ops[0][0]).toBe('set');
    expect(ops[0][1]).toBe('leads/place_1/sources/abc123');
    expect(ops[0][2]).not.toHaveProperty('id');
    expect(ops[0][2]).toMatchObject({ url: 'https://x.kr', type: 'website', status: 'ok', emails: ['a@x.kr'] });
    expect(ops[1][0]).toBe('update');
    expect(ops[1][1]).toBe('leads/place_1');
    expect(ops[1][2]).toMatchObject({ source_counts: result.counts, candidate_emails: result.candidate_emails });
    expect(typeof ops[1][2].sources_collected_at).toBe('string');
    expect(ops.at(-1)).toEqual(['commit']);
  });
});
