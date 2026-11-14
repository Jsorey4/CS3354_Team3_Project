/**
 * @author Jon Sorey
 * @description Calls the backend for the cost screen: load bids / budgets / stage costs / expenses (with
 *   search, filter, sort and partial stage selection), and create, edit or delete each kind of record.
 *   Members receive 403 from every one of these calls.
 * @traces SE-FR-01, SE-FR-02, SE-FR-03, SE-NFR-02, UC-01
 */
import { api } from '../../services/apiClient';
import type { CostQuery, CostSummary, Expense, ExpenseCategory, StageCost } from '../../shared/types';

export interface ExpenseInput {
  category: ExpenseCategory;
  description: string;
  amount: string;
  expense_date: string;
  stage_cost_id?: string | null;
}

export const costController = {
  summary: (projectId: string, query: CostQuery = {}) =>
    api.get<CostSummary>(`/api/projects/${projectId}/costs`, {
      search: query.search,
      category: query.category,
      sort_by: query.sort_by,
      sort_dir: query.sort_dir,
      stage_ids: query.stage_ids ?? undefined,
    }),
  updateFinancials: (projectId: string, values: { bid_amount?: string; budget_amount?: string }) =>
    api.put<CostSummary>(`/api/projects/${projectId}/financials`, values),
  addStage: (projectId: string, stage: { stage_name: string; amount: string; notes?: string }) =>
    api.post<StageCost>(`/api/projects/${projectId}/stage-costs`, stage),
  updateStage: (projectId: string, stageId: string, stage: { stage_name?: string; amount?: string; notes?: string }) =>
    api.put<StageCost>(`/api/projects/${projectId}/stage-costs/${stageId}`, stage),
  deleteStage: (projectId: string, stageId: string) => api.del<void>(`/api/projects/${projectId}/stage-costs/${stageId}`),
  addExpense: (projectId: string, expense: ExpenseInput) => api.post<Expense>(`/api/projects/${projectId}/expenses`, expense),
  updateExpense: (projectId: string, expenseId: string, expense: Partial<ExpenseInput>) =>
    api.put<Expense>(`/api/projects/${projectId}/expenses/${expenseId}`, expense),
  deleteExpense: (projectId: string, expenseId: string) => api.del<void>(`/api/projects/${projectId}/expenses/${expenseId}`),
};
