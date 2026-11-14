/**
 * @author Jon Sorey
 * @description Unit tests for exact cent math and the Total / Subtotal label.
 * @traces SE-NFR-01, SE-FR-02, UC-01
 */
import { describe, expect, it } from 'vitest';
import { calculateStageCostSummary, formatCents, normalizeAmount, parseCents, subtractAmounts, sumAmounts, validateExpense } from './model';

describe('UC-01 / SE-NFR-01 cost model', () => {
  it('adds money exactly (0.10 + 0.20 = 0.30, not 0.30000000000000004)', () => {
    expect(sumAmounts(['0.10', '0.20'])).toBe('0.30');
  });
  it('rounds half-up to the cent', () => {
    expect(normalizeAmount('10.005')).toBe('10.01');
    expect(normalizeAmount('10.004')).toBe('10.00');
    expect(parseCents('1234.565')).toBe(123457n);
    expect(formatCents(5n)).toBe('0.05');
  });
  it('labels a partial selection as Subtotal and a full one as Total', () => {
    const stages = [{ amount: '4250.00' }, { amount: '6800.50' }, { amount: '18400.25' }, { amount: '5120.10' }, { amount: '2300.00' }];
    expect(calculateStageCostSummary(stages, false)).toEqual({ sum: '36870.85', label: 'Total' });
    expect(calculateStageCostSummary(stages.slice(0, 2), true)).toEqual({ sum: '11050.50', label: 'Subtotal' });
  });
  it('rejects negative or malformed amounts', () => {
    expect(() => parseCents('-1')).toThrow();
    expect(validateExpense({ category: 'other', description: 'x', amount: '-5', expense_date: '2026-01-01' }).amount).toBeTruthy();
    expect(validateExpense({ category: 'snacks', description: '', amount: '5', expense_date: '' })).toHaveProperty('category');
  });
  it('subtracts exactly', () => {
    expect(subtractAmounts('42000.00', '36870.85')).toBe('5129.15');
  });
});
