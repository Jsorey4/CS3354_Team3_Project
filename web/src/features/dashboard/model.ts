/**
 * @author Myoram Langwang
 * @description Pure layout math for the dashboard grid. Widget.overlaps() is the axis-aligned bounding box
 *   test; Widget.moveTo() returns the widget at its new cell, or the untouched original (a "snap back")
 *   when the move would overlap another visible widget or leave the grid. Both run in O(W).
 * @traces SE-FR-24, SE-NFR-07, UC-17
 */

export interface GridRect {
  grid_x: number;
  grid_y: number;
  width: number;
  height: number;
}

export interface Placeable extends GridRect {
  id: string;
  is_hidden?: boolean;
}

/** (xA < xB + wB) && (xA + wA > xB) && (yA < yB + hB) && (yA + hA > yB) */
export function overlaps(a: GridRect, b: GridRect): boolean {
  return a.grid_x < b.grid_x + b.width && a.grid_x + a.width > b.grid_x && a.grid_y < b.grid_y + b.height && a.grid_y + a.height > b.grid_y;
}

export function collidesWithAny<T extends Placeable>(rect: GridRect, others: T[], ignoreId?: string): boolean {
  return others.some((o) => o.id !== ignoreId && !o.is_hidden && overlaps(rect, o));
}

export function fitsGrid(rect: GridRect, columns: number): boolean {
  return rect.grid_x >= 0 && rect.grid_y >= 0 && rect.grid_x + rect.width <= columns;
}

export interface MoveResult<T> {
  widget: T;
  moved: boolean;
  reason?: 'overlap' | 'out_of_bounds' | 'unchanged';
}

/** Widget.moveTo(widget, x, y, allWidgets): new position, or the original one when the move is invalid. */
export function moveTo<T extends Placeable>(widget: T, x: number, y: number, allWidgets: T[], columns = 12): MoveResult<T> {
  if (x === widget.grid_x && y === widget.grid_y) return { widget, moved: false, reason: 'unchanged' };
  const candidate = { ...widget, grid_x: x, grid_y: y };
  if (!fitsGrid(candidate, columns)) return { widget, moved: false, reason: 'out_of_bounds' };
  if (collidesWithAny(candidate, allWidgets, widget.id)) return { widget, moved: false, reason: 'overlap' };
  return { widget: candidate, moved: true };
}

export const Widget = { overlaps, moveTo };

/** Converts a drag delta in pixels into a whole-cell target, clamped to the grid. */
export function targetCell(
  origin: GridRect,
  deltaX: number,
  deltaY: number,
  cellWidth: number,
  rowHeight: number,
  gap: number,
  columns = 12,
): { x: number; y: number } {
  const dx = Math.round(deltaX / (cellWidth + gap));
  const dy = Math.round(deltaY / (rowHeight + gap));
  return {
    x: Math.max(0, Math.min(columns - origin.width, origin.grid_x + dx)),
    y: Math.max(0, origin.grid_y + dy),
  };
}

export function gridRows(widgets: GridRect[]): number {
  return widgets.reduce((max, w) => Math.max(max, w.grid_y + w.height), 1);
}
