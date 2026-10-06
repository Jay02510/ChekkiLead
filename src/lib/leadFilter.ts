import type { NaverSearchResult } from "../types";
import { stripHtml } from "./naverId.js";

// Decides whether a Naver result is worth enriching, using only the Naver
// category and title — runs before any Gemini call. Chekki targets kids'
// English academies, so adult/test-prep schools, non-schools and schools whose
// listing names another subject are rejected; schools whose listing doesn't name
// English are kept but sent to manual review (see englishSignal).
// Regular kindergartens are kept: hand review of the real leads found that
// most small Korean kindergartens teach English and this is how they're listed.

// Adult, test-prep and conversation categories (어학교육>토익, >IELTS, >영어회화 ...).
const REJECT_CATEGORY = /토익|토플|toefl|ielts|아이엘츠|teps|텝스|영어회화/i;

// Adult or test-prep brands that sometimes carry a generic category.
const REJECT_BRANDS = /해커스|파고다|YBM어학원|월스트리트|프라임아이엘츠/i;

// Not schools at all. Checked against the title AND the category, because the
// 키즈영어 and 유치원 queries pull in businesses that only share the keyword:
// kids' cafes, baking studios, book rental, pet shops, publishers, gift shops.
// Each one used to cost a Gemini call and a row in the review queue.
const NON_SCHOOL = /애견|강아지|반려동물|카페|실내놀이터|놀이터|시험센터|CBT|공방|베이킹|임대|대여|출판|도소매|쇼핑|미용|부동산/i;

// Public and school-attached kindergartens (공립병설유치원, 초등학교 병설유치원).
// They run on a municipal budget with no owner to sell to, so they are not
// leads however much English they teach.
const PUBLIC_KINDERGARTEN = /공립|국립|병설|시립|도립/;

// Does the Naver listing itself say the school teaches English?
//   confirmed: the name, category or description names English.
//   none:      the listing names a different subject or language and not English.
//   unsure:    anything else (a plain 유치원, 유아학습 ...). The school may teach
//              English, but this data can't say, so it goes to manual review.
export type EnglishSignal = "confirmed" | "unsure" | "none";

const ENGLISH = /영어|english|잉글리|잉글|이글리|\besl\b|원어민|이머전|immersion/i;
const OTHER_SUBJECT = /중국어|일본어|프랑스어|스페인어|독일어|한자|수학|코딩|피아노|태권도|논술|속셈|미술학원/;

export function englishSignal(item: Pick<NaverSearchResult, "title" | "category"> & { description?: string }): EnglishSignal {
  const text = `${stripHtml(item.title)} ${item.category || ""} ${stripHtml(item.description || "")}`;
  if (ENGLISH.test(text)) return "confirmed";
  if (OTHER_SUBJECT.test(text)) return "none";
  return "unsure";
}

export function isLikelyTarget(item: Pick<NaverSearchResult, "title" | "category"> & { description?: string }): boolean {
  const title = stripHtml(item.title);
  const category = item.category || "";
  if (REJECT_CATEGORY.test(category)) return false;
  if (REJECT_BRANDS.test(title)) return false;
  if (NON_SCHOOL.test(`${title} ${category}`)) return false;
  if (PUBLIC_KINDERGARTEN.test(`${title} ${category}`)) return false;
  if (englishSignal(item) === "none") return false;
  return true;
}
