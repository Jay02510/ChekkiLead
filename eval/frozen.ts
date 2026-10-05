// Loads the frozen sources (eval/sources/{naver_id}.json) for grounded eval
// runs, and caches chunk embeddings next to them so retrieval isn't re-paid.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { GroundedInput } from "../src/lib/groundedEnrich";
import type { EmbeddingStore } from "../src/lib/rag/ground";

const dir = "eval/sources";

export function loadFrozen(naverId: string): { input: GroundedInput; saveEmbeddings: () => void } | null {
  const path = `${dir}/${naverId}.json`;
  if (!existsSync(path)) return null;
  const snap = JSON.parse(readFileSync(path, "utf8"));
  const embPath = `${dir}/${naverId}.embeddings.json`;
  const embeddings: EmbeddingStore = existsSync(embPath) ? JSON.parse(readFileSync(embPath, "utf8")) : {};
  return {
    input: { sources: snap.sources ?? [], candidate_emails: snap.candidate_emails ?? [], embeddings },
    saveEmbeddings: () => writeFileSync(embPath, JSON.stringify(embeddings)),
  };
}
