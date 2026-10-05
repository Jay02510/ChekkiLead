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

// Not schools at all: dog daycares, cafes, test centres.
const NON_SCHOOL = /애견|강아지|카페|시험센터|CBT/i;

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
  if (NON_SCHOOL.test(title)) return false;
  if (englishSignal(item) === "none") return false;
  return true;
}
