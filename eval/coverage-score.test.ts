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
  it('ignores case and whitespace', () =>
    expect(emailHit(' Info@Academy.kr ', [{ email: 'info@academy.kr' }])).toBe(true));
  it('is false when the address was never collected', () =>
    expect(emailHit('a@x.kr', [{ email: 'b@x.kr' }])).toBe(false));
});
