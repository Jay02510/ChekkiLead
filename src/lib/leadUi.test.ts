import { describe, it, expect } from 'vitest';
import { buildContactUpdate } from './leadUi';

const lead = { email: 'guess@naver.com', phone: '', website: null as string | null };
const edit = { email: 'guess@naver.com', phone: '', website: '' };

describe('buildContactUpdate', () => {
  it('returns nothing when nothing changed', () =>
    expect(buildContactUpdate(lead, edit)).toEqual({ updates: {} }));
  it('stores a typed email as scraped and verified', () =>
    expect(buildContactUpdate(lead, { ...edit, email: ' real@academy.kr ' })).toEqual({
      updates: { email: 'real@academy.kr', email_confidence: 'scraped', email_verification: 'verified' },
    }));
  it('makes a cleared email unknown and unverified', () =>
    expect(buildContactUpdate(lead, { ...edit, email: '' })).toEqual({
      updates: { email: '', email_confidence: 'unknown', email_verification: 'unverified' },
    }));
  it('rejects an invalid email', () =>
    expect(buildContactUpdate(lead, { ...edit, email: 'not-an-email' })).toEqual({ error: 'That email address is not valid.' }));
  it('updates phone and website only', () =>
    expect(buildContactUpdate(lead, { ...edit, phone: '02-576-4726', website: 'https://blog.naver.com/bingo4726' })).toEqual({
      updates: { phone: '02-576-4726', website: 'https://blog.naver.com/bingo4726' },
    }));
  it('stores a cleared website as null', () =>
    expect(buildContactUpdate({ ...lead, website: 'https://a.kr' }, { ...edit, website: '' })).toEqual({ updates: { website: null } }));
});
