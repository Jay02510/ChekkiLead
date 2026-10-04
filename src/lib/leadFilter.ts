import type { NaverSearchResult } from "../types";
import { stripHtml } from "./naverId.js";

// Decides whether a Naver result is worth enriching, using only the Naver
// category and title — runs before any Gemini call. Chekki targets kids'
// English academies, so adult/test-prep schools, non-schools, and (by
// decision) regular kindergartens are rejected.

// Adult, test-prep and conversation categories (어학교육>토익, >IELTS, >영어회화 ...).
const REJECT_CATEGORY = /토익|토플|toefl|ielts|아이엘츠|teps|텝스|영어회화/i;

// Adult or test-prep brands that sometimes carry a generic category.
const REJECT_BRANDS = /해커스|파고다|YBM어학원|월스트리트|프라임아이엘츠/i;

// Not schools at all: dog daycares, cafes, test centres.
const NON_SCHOOL = /애견|강아지|카페|시험센터|CBT/i;

// Regular (non-English) kindergartens: 교육,학문>유치원, >사인사립유치원 ...
const REGULAR_KINDERGARTEN = /교육,학문>.*유치원/;

export function isLikelyTarget(item: Pick<NaverSearchResult, "title" | "category">): boolean {
  const title = stripHtml(item.title);
  const category = item.category || "";
  if (REJECT_CATEGORY.test(category)) return false;
  if (REJECT_BRANDS.test(title)) return false;
  if (NON_SCHOOL.test(title)) return false;
  if (REGULAR_KINDERGARTEN.test(category) && !title.includes("영어")) return false;
  return true;
}
