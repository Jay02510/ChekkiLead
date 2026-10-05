import { describe, it, expect } from 'vitest';
import { formatComparison } from './compare-format';

describe('formatComparison', () => {
  const base = { mode: 'baseline', commit: 'abc123', summary: { leads_scored: 24, age_range_iou: 0.5, not_found_claim_rate: 0.8, calls_per_lead: 1, input_tokens_per_lead: 1200 } };
  const grounded = { mode: 'grounded_full', commit: 'def456', summary: { leads_scored: 24, age_range_iou: 0.4, not_found_claim_rate: 0.1, verification_failure_rate: 0.05, calls_per_lead: 1, input_tokens_per_lead: 9000 } };

  it('puts every mode in its own column with its commit', () => {
    const out = formatComparison([base, grounded]);
    expect(out).toContain('baseline @ abc123');
    expect(out).toContain('grounded_full @ def456');
  });
  it('shows each metric side by side and n/a where a mode has none', () => {
    const row = formatComparison([base, grounded]).split('\n').find(l => l.startsWith('Verification failure rate'))!;
    expect(row).toMatch(/n\/a\s+5\.0%$/);
    const inv = formatComparison([base, grounded]).split('\n').find(l => l.startsWith('Claims where nothing findable'))!;
    expect(inv).toMatch(/80\.0%\s+10\.0%$/);
  });
});
