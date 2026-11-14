/**
 * @author Jon Sorey
 * @description Loads the performance / efficiency report for a project and date range. The server decides
 *   whether the caller sees the whole team or only their own hours.
 * @traces SE-FR-05, SE-NFR-02, UC-02
 */
import { api } from '../../services/apiClient';
import type { Efficiency, PerformanceReport } from '../../shared/types';

export const reportController = {
  performance: (projectId: string, startDate: string, endDate: string) =>
    api.get<PerformanceReport>(`/api/projects/${projectId}/reports/performance`, { start_date: startDate, end_date: endDate }),
};

/** Efficiency (%) = round(estimated / actual x 100, 2); "N/A" when actual is 0 or estimate missing. */
export function efficiencyPct(estimated: number | null | undefined, actual: number | null | undefined): Efficiency {
  if (estimated == null || actual == null || actual === 0) return 'N/A';
  return Math.round((estimated / actual) * 100 * 100 + Number.EPSILON) / 100;
}

export function formatEfficiency(value: Efficiency): string {
  return value === 'N/A' ? 'N/A' : `${value.toFixed(2)}%`;
}

export function validateRange(start: string, end: string): string | null {
  if (!start || !end) return 'Choose both dates';
  if (start > end) return 'Start date must be on or before end date';
  return null;
}
