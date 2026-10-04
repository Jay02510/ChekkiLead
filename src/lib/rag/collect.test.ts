import { describe, it, expect, beforeAll } from 'vitest';
import {
  coreName, isRelevantPost, unsupportedReason, toMobileBlogUrl, normalizeUrl, classifyBlogPost,
  extractEmails, chunk, fetchPage, searchNaverBlogs, collectForLead, classifyFetchError, sourceIdFor,
  type CollectLead, type BlogPost, type FetchLike,
} from './collect';

const lead = (over: Partial<CollectLead> = {}): CollectLead => ({
  institution_name_kr: 'DYB최선어학원 분당 직영',
  district: '분당구',
  address_full: '경기 성남시 분당구 백현로101번길 30 XY빌딩 4층',
  website: '',
  naver_raw: { title: 'DYB최선어학원 분당 직영', link: 'https://blog.naver.com/dybchoisun', category: '', description: '', telephone: '', address: '', roadAddress: '', mapx: '', mapy: '' },
  ...over,
});

const post = (over: Partial<BlogPost> = {}): BlogPost => ({
  title: '', description: '', link: 'https://blog.naver.com/someone/1', bloggername: 'someone', bloggerlink: 'https://blog.naver.com/someone', postdate: '20260101', ...over,
});

// A fetch that returns canned responses by URL substring.
const mockFetch = (routes: Record<string, () => Response | Promise<Response>>): FetchLike =>
  (async (input: any) => {
    const url = String(input);
    for (const [key, make] of Object.entries(routes)) if (url.includes(key)) return make();
    throw new Error(`unmocked fetch: ${url}`);
  }) as FetchLike;

const html = (body: string, status = 200, headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' }) =>
  () => new Response(body, { status, headers });

describe('coreName', () => {
  it('drops branch suffixes and the lead district, then spaces and case', () => {
    expect(coreName('DYB최선어학원 분당 직영', '분당구')).toBe('dyb최선어학원');
    expect(coreName('해커스어학원 강남역캠퍼스 제5별관', '강남구')).toBe('해커스어학원');
    expect(coreName('컬컴 잠실점', '송파구')).toBe('컬컴');
    expect(coreName('YBM어학원 강남센터', '강남구')).toBe('ybm어학원');
  });
  it('keeps the full name when everything would be dropped', () => {
    expect(coreName('본관', '')).toBe('본관');
  });
});

describe('isRelevantPost', () => {
  it('keeps a post naming the academy', () =>
    expect(isRelevantPost(post({ title: 'DYB 최선어학원 분당 후기' }), lead())).toBe(true));
  it('drops a post that never names the academy', () =>
    expect(isRelevantPost(post({ title: '분당 영어학원 추천', description: '여러 학원 비교' }), lead())).toBe(false));
  it('matches across spacing and case differences', () =>
    expect(isRelevantPost(post({ description: 'dyb최선 어학원' }), lead({ institution_name_kr: 'DYB최선어학원' }))).toBe(true));
  it('drops a same-name academy in another city', () =>
    expect(isRelevantPost(post({ title: 'DYB최선어학원 대구 수성캠퍼스 입학설명회', description: '대구 학부모님들께' }), lead())).toBe(false));
  it("keeps a same-name post that also mentions the lead's own area", () =>
    expect(isRelevantPost(post({ title: 'DYB최선어학원 분당 vs 강남 비교' }), lead())).toBe(true));
  it('keeps a post with the name but no area (ambiguous)', () =>
    expect(isRelevantPost(post({ title: 'DYB최선어학원 겨울방학 특강' }), lead())).toBe(true));
});

describe('URL classification', () => {
  it.each([
    ['https://www.instagram.com/x/', 'unsupported_host:instagram.com'],
    ['https://youtu.be/abc', 'unsupported_host:youtu.be'],
    ['https://www.youtube.com/@x', 'unsupported_host:youtube.com'],
    ['https://pf.kakao.com/_JuAZT/chat', 'unsupported_host:kakao.com'],
    ['https://booking.naver.com/booking/1', 'unsupported_host:booking.naver.com'],
    ['https://naver.me/abc', 'unsupported_host:naver.me'],
    ['ftp://x.kr', 'unsupported_url'],
  ])('%s -> %s', (url, reason) => expect(unsupportedReason(url)).toBe(reason));
  it.each(['http://www.hackers.ac/', 'https://blog.naver.com/x', 'www.example.kr'])('allows %s', url =>
    expect(unsupportedReason(url)).toBeNull());
});

describe('toMobileBlogUrl', () => {
  it('rewrites blog.naver.com to the mobile host', () =>
    expect(toMobileBlogUrl('https://blog.naver.com/abc/223')).toBe('https://m.blog.naver.com/abc/223'));
  it('leaves other hosts and already-mobile URLs alone', () => {
    expect(toMobileBlogUrl('https://www.hackers.ac/x')).toBe('https://www.hackers.ac/x');
    expect(toMobileBlogUrl('https://m.blog.naver.com/abc')).toBe('https://m.blog.naver.com/abc');
  });
});

describe('normalizeUrl', () => {
  it('ignores protocol, www., m. and trailing slashes', () => {
    expect(normalizeUrl('https://www.Hackers.ac/')).toBe('hackers.ac');
    expect(normalizeUrl('http://m.blog.naver.com/abc/')).toBe(normalizeUrl('https://blog.naver.com/abc'));
  });
  it('keeps the path and query', () =>
    expect(normalizeUrl('https://x.kr/a/b?id=3')).toBe('x.kr/a/b?id=3'));
});

describe('classifyBlogPost', () => {
  it("is own when the blogger id matches the lead's Naver link", () =>
    expect(classifyBlogPost(post({ bloggerlink: 'https://blog.naver.com/DybChoisun' }), lead())).toBe('blog_own'));
  it('is own when the blog name contains the academy core name', () =>
    expect(classifyBlogPost(post({ bloggername: 'DYB최선어학원 분당 공식블로그' }), lead({ naver_raw: undefined }))).toBe('blog_own'));
  it('is third-party otherwise', () =>
    expect(classifyBlogPost(post({ bloggername: '맘카페 후기' }), lead())).toBe('blog_third_party'));
});

describe('extractEmails', () => {
  it('finds two emails in one page, deduped and lowercased', () =>
    expect(extractEmails('문의: Info@Academy.kr 또는 admin@academy.kr, info@academy.kr')).toEqual(['info@academy.kr', 'admin@academy.kr']));
  it('decodes percent-encoded mailto links', () =>
    expect(extractEmails('<a href="mailto:hello%40academy.co.kr?subject=hi">')).toEqual(['hello@academy.co.kr']));
  it('drops image filenames', () =>
    expect(extractEmails('logo@2x.png banner@3x.jpg real@academy.kr')).toEqual(['real@academy.kr']));
  it('drops placeholders', () =>
    expect(extractEmails('your@email.com name@example.com user@domain.com')).toEqual([]));
  it('decodes HTML-entity @', () =>
    expect(extractEmails('contact&#64;academy.kr')).toEqual(['contact@academy.kr']));
  it('returns nothing for plain text', () => expect(extractEmails('no address here')).toEqual([]));
});

describe('chunk', () => {
  const sentences = Array.from({ length: 80 }, (_, i) => `이것은 ${i}번째 문장입니다.`).join(' ');

  it('keeps short text as a single chunk', () =>
    expect(chunk('짧은 글입니다.', 'abc')).toEqual([{ id: 'abc#0', text: '짧은 글입니다.' }]));
  it('returns nothing for empty text', () => expect(chunk('   ', 'abc')).toEqual([]));
  it('splits long text into chunks of at most 800 chars with sequential ids', () => {
    const chunks = chunk(sentences, 'abc');
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => {
      expect(c.id).toBe(`abc#${i}`);
      expect(c.text.length).toBeLessThanOrEqual(800);
    });
  });
  it('breaks at sentence ends when it can', () => {
    const chunks = chunk(sentences, 'abc');
    chunks.slice(0, -1).forEach(c => expect(c.text.endsWith('.')).toBe(true));
  });
  it('overlaps consecutive chunks', () => {
    const chunks = chunk(sentences, 'abc');
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i - 1].text.includes(chunks[i].text.slice(0, 20))).toBe(true);
    }
  });
  it('hard-splits text with no sentence ends and still makes progress', () => {
    const chunks = chunk('가'.repeat(2000), 'abc');
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.every(c => c.text.length <= 800)).toBe(true);
  });
  it('covers all of the text', () => {
    const chunks = chunk(sentences, 'abc');
    expect(chunks[0].text.startsWith('이것은 0번째')).toBe(true);
    expect(chunks.at(-1)!.text.endsWith('79번째 문장입니다.')).toBe(true);
  });
});

describe('fetchPage', () => {
  const page = `<html><head><title>학원 소개</title></head><body><nav>메뉴 홈 소개</nav><script>var x=1</script>
    <p>저희 학원은 초등학생을 위한 영어 전문 학원입니다. 문의는 info@academy.kr 로 주세요.</p>
    <a href="mailto:admin%40academy.kr">메일</a></body></html>`;

  it('extracts text and emails, dropping nav and script', async () => {
    const out = await fetchPage('https://academy.kr/', mockFetch({ 'academy.kr': html(page) }));
    expect(out.title).toBe('학원 소개');
    expect(out.text).toContain('초등학생을 위한 영어 전문 학원');
    expect(out.text).not.toContain('메뉴 홈');
    expect(out.text).not.toContain('var x');
    expect(out.emails).toEqual(['info@academy.kr', 'admin@academy.kr']);
  });
  it('requests the mobile host for blog.naver.com', async () => {
    let seen = '';
    await fetchPage('https://blog.naver.com/abc', (async (u: any) => { seen = String(u); return html(page)(); }) as FetchLike);
    expect(seen).toBe('https://m.blog.naver.com/abc');
  });
  it('sends an identifying User-Agent', async () => {
    let ua = '';
    await fetchPage('https://academy.kr/', (async (_u: any, init: any) => { ua = init.headers['User-Agent']; return html(page)(); }) as FetchLike);
    expect(ua).toContain('Chekki Lead'.replace(' ', ''));
  });
  it('reports http errors with the status', async () => {
    await expect(fetchPage('https://academy.kr/', mockFetch({ academy: html('', 403) }))).rejects.toThrow('http_403');
  });
  it('reports an empty page', async () => {
    await expect(fetchPage('https://academy.kr/', mockFetch({ academy: html('<html><body>hi</body></html>') }))).rejects.toThrow('empty_page');
  });
  it('reports a timeout', async () => {
    const f = (async () => { throw Object.assign(new Error('aborted'), { name: 'TimeoutError' }); }) as FetchLike;
    await expect(fetchPage('https://academy.kr/', f)).rejects.toThrow('timeout');
  });
  it('reports a certificate error', async () => {
    const f = (async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } }); }) as FetchLike;
    await expect(fetchPage('https://academy.kr/', f)).rejects.toThrow('certificate');
  });
  it('refuses unsupported hosts without fetching', async () => {
    const f = (async () => { throw new Error('should not fetch'); }) as FetchLike;
    await expect(fetchPage('https://www.instagram.com/x', f)).rejects.toThrow('unsupported_host:instagram.com');
  });
  it('caps the body at 500 KB', async () => {
    const big = `<html><body><p>${'가'.repeat(400 * 1024)}</p></body></html>`; // ~1.2 MB in UTF-8
    const out = await fetchPage('https://academy.kr/', mockFetch({ academy: html(big) }));
    expect(out.text.length).toBeLessThan(400 * 1024);
  });
  it('truncates very long text so a source fits in one Firestore document', async () => {
    const long = `<html><body><p>${'가나다라. '.repeat(40_000)}</p></body></html>`;
    const out = await fetchPage('https://academy.kr/', mockFetch({ academy: html(long) }));
    expect(out.text.length).toBeLessThanOrEqual(100_000);
  });
  it('decodes EUC-KR pages from the content-type charset', async () => {
    const bytes = new Uint8Array([0xc7, 0xd0, 0xbf, 0xf8]); // 학원 in EUC-KR
    const body = Buffer.concat([Buffer.from('<html><body><p>'), Buffer.from(bytes), Buffer.from(` ${'x'.repeat(60)}</p></body></html>`)]);
    const out = await fetchPage('https://academy.kr/', mockFetch({ academy: () => new Response(body, { headers: { 'content-type': 'text/html; charset=euc-kr' } }) }));
    expect(out.text).toContain('학원');
  });
});

describe('classifyFetchError', () => {
  it('maps dns failures', () => expect(classifyFetchError({ cause: { code: 'ENOTFOUND' } })).toBe('dns'));
  it('falls back to network', () => expect(classifyFetchError(new Error('boom'))).toBe('network'));
});

describe('searchNaverBlogs', () => {
  beforeAll(() => {
    process.env.NAVER_CLIENT_ID = 'id';
    process.env.NAVER_CLIENT_SECRET = 'secret';
  });
  it('queries with the quoted name and district, strips HTML, keeps the fields', async () => {
    let url = '';
    const f = (async (u: any) => {
      url = String(u);
      return new Response(JSON.stringify({ items: [{ title: '<b>DYB</b>최선', description: '후기 &amp; 정보', link: 'https://blog.naver.com/a/1', bloggername: '<b>블로거</b>', bloggerlink: 'https://blog.naver.com/a', postdate: '20260102' }] }));
    }) as FetchLike;
    const posts = await searchNaverBlogs('DYB최선어학원', '분당구', f);
    expect(decodeURIComponent(url)).toContain('query="DYB최선어학원" 분당구');
    expect(url).toContain('display=30');
    expect(url).toContain('sort=sim');
    expect(posts[0]).toMatchObject({ title: 'DYB최선', bloggername: '블로거', link: 'https://blog.naver.com/a/1', postdate: '20260102' });
  });
  it('throws on a non-ok response', async () => {
    await expect(searchNaverBlogs('x', 'y', mockFetch({ openapi: html('', 500) }))).rejects.toThrow('500');
  });
});

describe('collectForLead', () => {
  beforeAll(() => {
    process.env.NAVER_CLIENT_ID = 'id';
    process.env.NAVER_CLIENT_SECRET = 'secret';
  });
  const blogResponse = () => new Response(JSON.stringify({ items: [
    { title: 'DYB최선어학원 분당 후기', description: '아이가 다니고 있어요', link: 'https://blog.naver.com/mom/1', bloggername: '엄마', bloggerlink: 'https://blog.naver.com/mom', postdate: '20260101' },
    { title: 'DYB최선어학원 대구 설명회', description: '대구 학부모', link: 'https://blog.naver.com/mom/2', bloggername: '엄마', bloggerlink: 'https://blog.naver.com/mom', postdate: '20260102' },
    { title: '무관한 글', description: '다른 학원', link: 'https://blog.naver.com/mom/3', bloggername: '엄마', bloggerlink: 'https://blog.naver.com/mom', postdate: '20260103' },
  ] }));

  it('collects relevant blog snippets, own pages, errors and candidate emails', async () => {
    const own = `<html><body><p>${'DYB최선어학원 분당 직영은 초등 영어 전문입니다. '.repeat(3)} 문의 dybitcenter@gmail.com</p></body></html>`;
    const out = await collectForLead(
      lead({ website: 'https://www.instagram.com/dyb' }),
      { fetchImpl: mockFetch({ 'openapi.naver.com': blogResponse, 'm.blog.naver.com/dybchoisun': html(own) }), sleep: async () => {}, now: () => '2026-10-04T00:00:00.000Z' },
    );
    const byType = (t: string) => out.sources.filter(s => s.type === t && s.status === 'ok');
    expect(byType('blog_third_party')).toHaveLength(1); // the Daegu post and the unrelated post are filtered
    expect(byType('blog_third_party')[0].chunks).toHaveLength(1);
    expect(byType('blog_own')).toHaveLength(1);
    expect(out.counts).toEqual({ blog_own: 1, blog_third_party: 1, website: 0, errors: 1 });
    expect(out.sources.find(s => s.status === 'error')!.error).toBe('unsupported_host:instagram.com');
    expect(out.candidate_emails).toEqual([{ email: 'dybitcenter@gmail.com', sourceId: sourceIdFor(normalizeUrl('https://blog.naver.com/dybchoisun')) }]);
  });
  it('marks snippets as via search and fetched pages as via page', async () => {
    const own = `<html><body><p>${'DYB최선어학원 분당 직영은 초등 영어 전문입니다. '.repeat(3)}</p></body></html>`;
    const out = await collectForLead(lead(), { fetchImpl: mockFetch({ 'openapi.naver.com': blogResponse, 'm.blog.naver.com/dybchoisun': html(own) }), sleep: async () => {} });
    expect(out.sources.filter(s => s.via === 'search')).toHaveLength(1);
    expect(out.sources.filter(s => s.via === 'page')).toHaveLength(1);
  });
  it('fetches a URL once when the listing link and saved website are the same page', async () => {
    let fetches = 0;
    const own = `<html><body><p>${'초등 영어 전문 학원 소개 문장입니다. '.repeat(4)}</p></body></html>`;
    const f = (async (u: any) => {
      if (String(u).includes('openapi.naver.com')) return new Response(JSON.stringify({ items: [] }));
      fetches++;
      return html(own)();
    }) as FetchLike;
    const sameLink = 'https://academy.kr/';
    await collectForLead(lead({ website: sameLink, naver_raw: { ...lead().naver_raw!, link: sameLink } }), { fetchImpl: f, sleep: async () => {} });
    expect(fetches).toBe(1);
  });
  it('records a blog-search failure instead of dropping it', async () => {
    const out = await collectForLead(lead({ naver_raw: undefined }), { fetchImpl: mockFetch({ 'openapi.naver.com': html('', 429) }), sleep: async () => {} });
    expect(out.counts.errors).toBe(1);
    expect(out.sources[0].error).toContain('blog_search_failed');
  });
});
