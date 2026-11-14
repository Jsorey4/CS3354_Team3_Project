/**
 * @author Myoram Langwang
 * @description Calls the backend to load the dashboard (layout + all widget data in one request), add,
 *   remove, hide and move widgets, and restore the default layout.
 * @traces SE-FR-21, SE-FR-22, SE-FR-23, SE-FR-24, SE-FR-25, UC-16, UC-17
 */
import { api } from '../../services/apiClient';
import type { DashboardPayload, Widget } from '../../shared/types';

export const dashboardController = {
  load: () => api.get<DashboardPayload>('/api/dashboard/widgets'),
  add: (widgetType: string, gridX?: number, gridY?: number) =>
    api.post<DashboardPayload>('/api/dashboard/widgets', { widget_type: widgetType, grid_x: gridX, grid_y: gridY }),
  remove: (id: string) => api.del<DashboardPayload>(`/api/dashboard/widgets/${id}`),
  hide: (id: string) => api.patch<DashboardPayload>(`/api/dashboard/widgets/${id}/hide`),
  restoreDefault: () => api.post<DashboardPayload>('/api/dashboard/widgets/restore-default'),
  move: (id: string, gridX: number, gridY: number) =>
    api.put<Widget>(`/api/dashboard/widgets/${id}/position`, { grid_x: gridX, grid_y: gridY }),
};
