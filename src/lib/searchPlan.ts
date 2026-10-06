// What to search on Naver Local, and in what order.
//
// Naver Local Search returns at most 5 results per query and offers no real
// paging, so a district-level query ("강남구 영어유치원") always surfaces the
// same handful of large, well-reviewed academies — exactly the ones with a
// head office and a long sales cycle. Searching by 동 (neighbourhood) instead
// splits the same area into ~8 separate top-5 lists, which is the only way to
// reach the small owner-operated schools this outreach is for.
//
// ponytail: a hand-written list, not a 행정동 dataset or a Firestore-backed
// settings UI. Edit the array and redeploy. The main residential
// neighbourhoods of five districts is the whole target market right now.
export interface Neighbourhood {
  district: string;
  dong: string;
}

export const NEIGHBOURHOODS: Neighbourhood[] = [
  // 강남구
  { district: "강남구", dong: "대치동" },
  { district: "강남구", dong: "역삼동" },
  { district: "강남구", dong: "도곡동" },
  { district: "강남구", dong: "개포동" },
  { district: "강남구", dong: "일원동" },
  { district: "강남구", dong: "압구정동" },
  { district: "강남구", dong: "청담동" },
  { district: "강남구", dong: "논현동" },
  // 서초구
  { district: "서초구", dong: "서초동" },
  { district: "서초구", dong: "반포동" },
  { district: "서초구", dong: "잠원동" },
  { district: "서초구", dong: "방배동" },
  { district: "서초구", dong: "양재동" },
  { district: "서초구", dong: "우면동" },
  { district: "서초구", dong: "내곡동" },
  // 송파구
  { district: "송파구", dong: "잠실동" },
  { district: "송파구", dong: "문정동" },
  { district: "송파구", dong: "가락동" },
  { district: "송파구", dong: "방이동" },
  { district: "송파구", dong: "오금동" },
  { district: "송파구", dong: "석촌동" },
  { district: "송파구", dong: "송파동" },
  { district: "송파구", dong: "거여동" },
  // 마포구
  { district: "마포구", dong: "상암동" },
  { district: "마포구", dong: "성산동" },
  { district: "마포구", dong: "망원동" },
  { district: "마포구", dong: "연남동" },
  { district: "마포구", dong: "합정동" },
  { district: "마포구", dong: "공덕동" },
  { district: "마포구", dong: "염리동" },
  // 분당구 (성남시)
  { district: "분당구", dong: "정자동" },
  { district: "분당구", dong: "서현동" },
  { district: "분당구", dong: "수내동" },
  { district: "분당구", dong: "이매동" },
  { district: "분당구", dong: "야탑동" },
  { district: "분당구", dong: "구미동" },
  { district: "분당구", dong: "판교동" },
  { district: "분당구", dong: "금곡동" },
];

// 초등영어학원 is gone: those listings are mostly older learners, which
// isLikelyTarget rejects anyway, so the query spent a slot for nothing.
// 유치원 is broad on purpose — englishSignal decides whether each listing
// names English, and anything unsure goes to the Review queue.
export const KEYWORDS = ["영어유치원", "어린이영어학원", "키즈영어", "유치원"];

// The district goes in front of the 동 because dong names repeat across the
// country: a bare "금곡동 유치원" came back with 남양주금곡초등학교병설유치원,
// a different city entirely. Naver resolves "분당구 금곡동" to the right one.
// This is still a neighbourhood query — the district only narrows it.
export const buildQueries = (): string[] =>
  NEIGHBOURHOODS.flatMap(n => KEYWORDS.map(k => `${n.district} ${n.dong} ${k}`));

export const districts = () => [...new Set(NEIGHBOURHOODS.map(n => n.district))];
