import { describe, it, expect } from 'vitest';
import { isLikelyTarget } from './leadFilter';

// The 30 category/title pairs of the first (untargeted) gold sample, with
// the verdict the filter should give each.
const GOLD_V0: [string, string, boolean][] = [
  ['교육,학문>유치원', '성산아트유치원', false],
  ['교육,학문>유치원', '신아유치원', false],
  ['어학교육>영어회화', '컬컴 잠실점', false],
  ['교육,학문>유치원', '여나유치원', false],
  ['교육,학문>유치원', '판교반디유치원', false],
  ['교육,학문>유치원', '삼성유치원', false],
  ['어학교육>영어교육', '나교수어학원', true],
  ['어학교육>토익', '해커스어학원 강남역캠퍼스 제5별관', false],
  ['어학교육>영어회화', '퍼스널 잉글리쉬', false],
  ['어학교육>영어교육', 'DYB최선어학원 분당 직영', true],
  ['교육,학문>유아학습', '리틀러너스', true],
  ['어학교육>영어교육', '피아이어학원', true],
  ['어학교육>영어회화', 'OTP영어학원', false],
  ['교육,학문>사인사립유치원', '아름다운유치원', false],
  ['교육,학문>유치원', '리아유치원', false],
  ['어학교육>영어회화', '앳빌듀 어학원 분당센터', false],
  ['어학교육>영어회화', '월스트리트 잉글리시 분당센터', false],
  ['어학교육>영어교육', '함영원영어학원', true],
  ['어학교육>영어회화', '신촌 프로젝트', false],
  ['교육,학문>유치원', '서울솔방울유치원', false],
  ['교육,학문>유치원', '은선유치원', false],
  ['어학교육>IELTS', '프라임아이엘츠 홍대센터', false],
  ['교육,학문>유치원', '마포대진유치원', false],
  ['어학교육>영어교육', '해커스어학원 강남역캠퍼스 본관', false],
  ['어학교육>영어교육', '파고다어학원 강남', false],
  ['교육,학문>유치원', '뽀뽀뽀유치원', false],
  ['어학교육>영어교육', 'YBM어학원 강남센터', false],
  ['교육,학문>유치원', '햇빛유치원', false],
  ['교육,학문>유치원', '은정유치원', false],
  ['어학교육>영어교육', '랜퍼스 키즈잉글리쉬 어학원 송파', true],
];

describe('isLikelyTarget on the v0 gold sample', () => {
  it.each(GOLD_V0)('%s | %s -> %s', (category, title, expected) => {
    expect(isLikelyTarget({ category, title: `<b>${title}</b>` })).toBe(expected);
  });
});

describe('isLikelyTarget rules', () => {
  it('keeps a 유치원-category place whose title says 영어', () =>
    expect(isLikelyTarget({ category: '교육,학문>유치원', title: '<b>리틀팍스 영어유치원</b>' })).toBe(true));
  it('rejects dog daycares, cafes and test centres', () => {
    expect(isLikelyTarget({ category: '교육,학문>유치원', title: '멍파 강아지유치원&애견호텔 영어' })).toBe(false);
    expect(isLikelyTarget({ category: '음식점>카페', title: '랭스영 카페앤펍' })).toBe(false);
    expect(isLikelyTarget({ category: '어학교육>영어교육', title: 'YBM 서초CBT센터' })).toBe(false);
    expect(isLikelyTarget({ category: '교육,학문', title: '메이플넥스 강남시험센터' })).toBe(false);
  });
  it('rejects TOEFL / TEPS categories', () => {
    expect(isLikelyTarget({ category: '어학교육>토플', title: 'x어학원' })).toBe(false);
    expect(isLikelyTarget({ category: '어학교육>TEPS', title: 'x어학원' })).toBe(false);
  });
});
