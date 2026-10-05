import { describe, it, expect } from 'vitest';
import { urlHit, emailHit } from './coverage-score';

describe('urlHit', () => {
  it('matches across protocol, www., m. and trailing slash', () => {
    expect(urlHit(['http://www.hackers.ac/'], ['https://hackers.ac'])).toBe(true);
    expect(urlHit(['https://blog.naver.com/abc/123'], ['https://m.blog.naver.com/abc/123/'])).toBe(true);
  });
  it('needs only one gold URL to match', () =>
    expect(urlHit(['https://a.kr/x', 'https://b.kr/y'], ['https://b.kr/y'])).toBe(true));
  it('does not match a different path on the same host', () =>
    expect(urlHit(['https://a.kr/x'], ['https://a.kr/y'])).toBe(false));
  it('does not match a different query', () =>
    expect(urlHit(['https://a.kr/p?id=1'], ['https://a.kr/p?id=2'])).toBe(false));
  it('is false with no gold URLs', () => expect(urlHit([], ['https://a.kr'])).toBe(false));
});

describe('emailHit', () => {
  const own = (email: string) => ({ email, sourceType: 'website' as const });
  it('ignores case and whitespace', () =>
    expect(emailHit(' Info@Academy.kr ', [own('info@academy.kr')])).toBe(true));
  it('is false when the address was never collected', () =>
    expect(emailHit('a@x.kr', [own('b@x.kr')])).toBe(false));
  it('does not count an address found only in a third-party post', () =>
    expect(emailHit('a@x.kr', [{ email: 'a@x.kr', sourceType: 'blog_third_party' }])).toBe(false));
  it('counts an address from the academy own blog', () =>
    expect(emailHit('a@x.kr', [{ email: 'a@x.kr', sourceType: 'blog_own' }])).toBe(true));
  it('does not trust an entry with no sourceType', () =>
    expect(emailHit('a@x.kr', [{ email: 'a@x.kr' } as any])).toBe(false));
});
