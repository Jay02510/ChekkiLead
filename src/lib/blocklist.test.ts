import { describe, it, expect } from 'vitest';
import { isContactBlocked, blocklistFromDocs, loadContactBlocklist } from './blocklist';

const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

describe('isContactBlocked', () => {
  it('blocks an opted-out lead', () => {
    expect(isContactBlocked({ firebase_status: 'opted_out' })).toBe(true);
  });

  it('blocks a lead that was already emailed, replied or bounced', () => {
    for (const firebase_status of ['sent', 'replied', 'bounced']) {
      expect(isContactBlocked({ firebase_status })).toBe(true);
    }
  });

  it('blocks a deleted lead whatever its status', () => {
    expect(isContactBlocked({ firebase_status: 'not_contacted', deleted: true })).toBe(true);
  });

  it('lets a not-contacted lead through', () => {
    expect(isContactBlocked({ firebase_status: 'not_contacted' })).toBe(false);
    expect(isContactBlocked({ firebase_status: 'pending' })).toBe(false);
    expect(isContactBlocked({})).toBe(false);
  });
});

describe('blocklistFromDocs', () => {
  it('collects only the blocked ids, keyed by naver_id', () => {
    const set = blocklistFromDocs([
      doc('a', { naver_id: 'a', firebase_status: 'opted_out' }),
      doc('b', { naver_id: 'b', firebase_status: 'sent' }),
      doc('c', { naver_id: 'c', firebase_status: 'not_contacted' }),
      doc('d', { naver_id: 'd', firebase_status: 'not_contacted', deleted: true }),
    ]);
    expect(set).toEqual(new Set(['a', 'b', 'd']));
  });

  it('falls back to the document id when the lead has no naver_id field', () => {
    expect(blocklistFromDocs([doc('legacy_key', { firebase_status: 'sent' })])).toEqual(new Set(['legacy_key']));
  });
});

describe('loadContactBlocklist', () => {
  it('reads the legacy collection, not the active one', async () => {
    let read = '';
    const db: any = {
      collection: (name: string) => {
        read = name;
        return { select: () => ({ get: async () => ({ docs: [doc('a', { naver_id: 'a', firebase_status: 'sent' })] }) }) };
      },
    };
    expect(await loadContactBlocklist(db)).toEqual(new Set(['a']));
    expect(read).toBe('leads');
  });
});
