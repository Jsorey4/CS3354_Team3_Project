/**
 * @author Jon Sorey
 * @description Exact money math in the browser. Amounts are handled as whole cents (BigInt), never as
 *   floating point, and rounded half-up to the cent - the same rule as the server's Decimal(ROUND_HALF_UP).
 *   calculateStageCostSummary() returns the stage-cost sum labelled "Total" or "Subtotal". Bids, budgets
 *   and expenses are never added to it.
 * @traces SE-NFR-01, SE-FR-01, SE-FR-02, SE-FR-03, UC-01
 */
import type { ExpenseCategory } from '../../shared/types';

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'labor', label: 'Labor' },
  { value: 'materials', label: 'Materials' },
  { value: 'software', label: 'Software' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'travel', label: 'Travel' },
  { value: 'services', label: 'Services' },
  { value: 'other', label: 'Other' },
];

const AMOUNT_RE = /^\s*(\d+)(?:\.(\d*))?\s*$/;

export function isValidAmount(value: string): boolean {
  return AMOUNT_RE.test(value);
}

/** "1234.565" -> 123457n (cents, half-up). Throws on malformed or negative input. */
export function parseCents(value: string): bigint {
  const match = AMOUNT_RE.exec(value);
  if (!match) throw new Error(`Invalid amount: ${value}`);
  const whole = BigInt(match[1]);
  const frac = (match[2] ?? '').padEnd(3, '0');
  let cents = whole * 100n + BigInt(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1n;
  return cents;
}

export function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${frac}`;
}

export function normalizeAmount(value: string): string {
  return formatCents(parseCents(value));
}

export function sumAmounts(amounts: string[]): string {
  return formatCents(amounts.reduce((acc, a) => acc + parseCents(a), 0n));
}

export function calculateStageCostSummary(stages: { amount: string }[], isPartial: boolean): { sum: string; label: 'Total' | 'Subtotal' } {
  return { sum: sumAmounts(stages.map((s) => s.amount)), label: isPartial ? 'Subtotal' : 'Total' };
}

/** Difference between two money strings (e.g. budget remaining), exact to the cent. */
export function subtractAmounts(a: string, b: string): string {
  return formatCents(parseCents(a) - parseCents(b));
}

export interface ExpenseForm {
  category: string;
  description: string;
  amount: string;
  expense_date: string;
}

export function validateExpense(form: ExpenseForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!EXPENSE_CATEGORIES.some((c) => c.value === form.category)) errors.category = 'Choose a category';
  if (!form.description.trim()) errors.description = 'Description is required';
  if (!isValidAmount(form.amount)) errors.amount = 'Enter an amount of 0 or more, like 125.50';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.expense_date)) errors.expense_date = 'Choose a date';
  return errors;
}
