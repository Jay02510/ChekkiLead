import { describe, it, expect } from 'vitest';
import { plannedBlanks } from './blank-legacy-guesses';
import type { EnrichedLead } from '../src/types';

const lead = (over: Partial<EnrichedLead> = {}): EnrichedLead => ({
  institution_name_en: 'X', institution_name_kr: 'X', institution_type: 'kindergarten',
  city: 'Seoul', district: 'Mapo-gu', email: '', email_confidence: 'unknown', phone: '02-1',
  naver_id: 'hash_1', student_age_range: '', approx_students: '', outreach_priority: 3,
  fit_reason: '', firebase_status: 'not_contacted', ...over,
});

describe('plannedBlanks', () => {
  it('blanks a constructed email and its confidence', () => {
    expect(plannedBlanks(lead({ email: 'info@guess.co.kr', email_confidence: 'estimated' })))
      .toEqual({ email: '', email_confidence: 'unknown' });
  });

  it('keeps a scraped email — it came off a real page', () => {
    expect(plannedBlanks(lead({ email: 'real@school.kr', email_confidence: 'scraped' }))).toEqual({});
  });

  it('blanks guessed ages, counts, levels and hook', () => {
    expect(plannedBlanks(lead({
      student_age_range: '5-12 years', approx_students: '100', cefr_levels_taught: ['A1', 'A2'],
      personalization_hook: 'A well-regarded academy',
    }))).toEqual({ student_age_range: '', approx_students: '', cefr_levels_taught: [], personalization_hook: '' });
  });

  it('never blanks a field a person typed in', () => {
    expect(plannedBlanks(lead({
      email: 'typed@school.kr', email_confidence: 'estimated',
      student_age_range: '3-5 years', manual_fields: ['email', 'student_age_range'],
    }))).toEqual({});
  });

  it('plans nothing for a lead with nothing invented left', () => {
    expect(plannedBlanks(lead())).toEqual({});
    expect(plannedBlanks(lead({ cefr_levels_taught: [] }))).toEqual({});
  });
});
