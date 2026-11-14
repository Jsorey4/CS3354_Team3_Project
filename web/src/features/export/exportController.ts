/**
 * @author Saaqib Shaik
 * @description Asks the backend to export a project's deadlines (.ics download, or Google / Outlook links
 *   after consent) and its data (.xlsx download, or a Google Sheets payload).
 * @traces SE-FR-19, SE-FR-20, UC-14, UC-15
 */
import { api, downloadFile } from '../../services/apiClient';
import type { CalendarExportResult, CalendarTarget, SheetsExportResult, SpreadsheetSection } from '../../shared/types';

export interface CalendarIncludes {
  include_project_deadline: boolean;
  include_task_due_dates: boolean;
  include_soft_deadlines: boolean;
}

export const exportController = {
  downloadIcs: (projectId: string, includes: CalendarIncludes) =>
    downloadFile(`/api/projects/${projectId}/export/calendar`, { target: 'ical', ...includes }, 'deadlines.ics'),
  toProvider: (projectId: string, target: Exclude<CalendarTarget, 'ical'>, consent: boolean, includes: CalendarIncludes) =>
    api.post<CalendarExportResult>(`/api/projects/${projectId}/export/calendar`, { target, oauth_consent: consent, ...includes }),
  downloadXlsx: (projectId: string, sections: SpreadsheetSection[]) =>
    downloadFile(`/api/projects/${projectId}/export/spreadsheet`, { target: 'excel', sections }, 'export.xlsx'),
  toSheets: (projectId: string, sections: SpreadsheetSection[]) =>
    api.post<SheetsExportResult>(`/api/projects/${projectId}/export/spreadsheet`, { target: 'sheets', sections }),
};
