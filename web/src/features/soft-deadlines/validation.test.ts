/**
 * @author Preethi Seereddy
 * @description Unit tests for validateSoftDeadlineDate (soft < final, strictly) and the priority rule.
 * @traces SE-FR-06, SE-FR-09, SE-NFR-03, UC-05, UC-06
 */
import { describe, expect, it } from 'vitest';
import { NEEDS_DUE_DATE, SOFT_DEADLINE_ERROR, isValidSoftDeadlinePriority, softDeadlineError, validateSoftDeadlineDate } from './validation';

describe('UC-05 / UC-06 soft deadline validation', () => {
  const due = '2026-12-10T17:00:00Z';
  it('accepts a date strictly before the final due date', () => {
    expect(validateSoftDeadlineDate('2026-12-09T17:00:00Z', due)).toBe(true);
  });
  it('rejects equal and later dates', () => {
    expect(validateSoftDeadlineDate(due, due)).toBe(false);
    expect(validateSoftDeadlineDate('2026-12-11T00:00:00Z', due)).toBe(false);
    expect(softDeadlineError('2026-12-11T00:00:00Z', due)).toBe(SOFT_DEADLINE_ERROR);
  });
  it('requires the task to have a due date', () => {
    expect(validateSoftDeadlineDate('2026-12-01T00:00:00Z', null)).toBe(false);
    expect(softDeadlineError('2026-12-01T00:00:00Z', null)).toBe(NEEDS_DUE_DATE);
  });
  it('SE-FR-09: accepts only high, medium or low priority', () => {
    expect(['high', 'medium', 'low'].every(isValidSoftDeadlinePriority)).toBe(true);
    expect(isValidSoftDeadlinePriority('urgent')).toBe(false);
  });
});
