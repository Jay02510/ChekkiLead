import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { BASELINE_SYSTEM_PROMPT, BASELINE_ENRICH_SCHEMA, BASELINE_V0_SYSTEM_PROMPT, BASELINE_V0_ENRICH_SCHEMA, SYSTEM_PROMPT, ENRICH_SCHEMA } from './geminiPrompts';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// The baseline is the control for the grounded-enrichment comparison. If this
// fails you changed it: either undo the edit, or — if the change is deliberate
// — update the hashes and note in the commit that older eval results no
// longer compare.
describe('frozen baseline enrichment', () => {
  it('has not changed the system prompt', () =>
    expect(sha(BASELINE_SYSTEM_PROMPT)).toBe('055c3af0b52640bdd8f8f6ce01e640bfc14054225cb411e2879fbdc71a24a9fc'));
  it('has not changed the response schema', () =>
    expect(sha(JSON.stringify(BASELINE_ENRICH_SCHEMA))).toBe('b6000174f33cd676d8f48cd4fe908788c5fba3b393fec3d66666ea57431cd3bc'));
  it('is what the original names point at', () => {
    expect(SYSTEM_PROMPT).toBe(BASELINE_SYSTEM_PROMPT);
    expect(ENRICH_SCHEMA).toBe(BASELINE_ENRICH_SCHEMA);
  });
});

// baseline_v0 is a historical record: the pipeline as it ran before 5b6dd9b
// removed the guessing instructions. It is what the eval compares everything
// against, so it must not be tidied or "fixed". Restore it from
// `git show 22bc257:src/lib/geminiPrompts.ts` if this fails.
describe('frozen baseline_v0 enrichment', () => {
  it('has not changed the system prompt', () =>
    expect(sha(BASELINE_V0_SYSTEM_PROMPT)).toBe('30e5a7d9cfca280ccf6423f1281487537c58b1de2e22cf869d4fcdfdde5126d3'));
  it('has not changed the response schema', () =>
    expect(sha(JSON.stringify(BASELINE_V0_ENRICH_SCHEMA))).toBe('a9c251087c6ffd745a4524faf85bfb4df08f9f99b6e2f61783c6c5830fe9d52a'));
  it('still tells the model to guess, which is the point of keeping it', () => {
    expect(BASELINE_V0_SYSTEM_PROMPT).toContain('Always provide something');
    expect(BASELINE_V0_SYSTEM_PROMPT).toContain('construct the most likely email');
  });
});
