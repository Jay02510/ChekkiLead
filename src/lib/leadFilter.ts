import type { NaverSearchResult } from "../types";
import { stripHtml } from "./naverId.js";

// Decides whether a Naver result is worth enriching, using only the Naver
// category and title — runs before any Gemini call. Chekki targets kids'
// English academies, so adult/test-prep schools and non-schools are rejected.
// Regular kindergartens are kept: hand review of the real leads found that
// most small Korean kindergartens teach English and this is how they're listed.

// Adult, test-prep and conversation categories (어학교육>토익, >IELTS, >영어회화 ...).
const REJECT_CATEGORY = /토익|토플|toefl|ielts|아이엘츠|teps|텝스|영어회화/i;

// Adult or test-prep brands that sometimes carry a generic category.
const REJECT_BRANDS = /해커스|파고다|YBM어학원|월스트리트|프라임아이엘츠/i;

// Not schools at all: dog daycares, cafes, test centres.
const NON_SCHOOL = /애견|강아지|카페|시험센터|CBT/i;

export function isLikelyTarget(item: Pick<NaverSearchResult, "title" | "category">): boolean {
  const title = stripHtml(item.title);
  const category = item.category || "";
  if (REJECT_CATEGORY.test(category)) return false;
  if (REJECT_BRANDS.test(title)) return false;
  if (NON_SCHOOL.test(title)) return false;
  return true;
}
