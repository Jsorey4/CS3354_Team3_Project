/**
 * @author Myoram Langwang
 * @description The 12-column dashboard grid from dashboard.html. In "Customize" mode each widget can be
 *   dragged by its handle; a green outline previews a free spot and a red one an overlap. Dropping on an
 *   overlap, or a server 409, snaps the widget back to where it was with a short shake.
 * @traces SE-FR-21, SE-FR-23, SE-FR-24, SE-NFR-05, SE-NFR-07, UC-16, UC-17
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Widget as WidgetModel } from '../../shared/types';
import { Icon } from '../../shared/ui';
import { collidesWithAny, gridRows, moveTo, targetCell } from './model';

// Mockup cards: 24px gaps, ~256px rows (3 x 72px + 2 x 24px gaps = 264px).
const ROW_HEIGHT = 72;
const GAP = 24;

interface Props {
  widgets: WidgetModel[];
  columns: number;
  editing: boolean;
  onMove: (widget: WidgetModel, x: number, y: number) => Promise<boolean>;
  onHide: (widget: WidgetModel) => void;
  onRemove: (widget: WidgetModel) => void;
  renderBody: (widget: WidgetModel) => ReactNode;
}

interface DragState {
  id: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
}

function useWide(): boolean {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const fn = () => setWide(mql.matches);
    mql.addEventListener('change', fn);
    return () => mql.removeEventListener('change', fn);
  }, []);
  return wide;
}

export function WidgetGrid({ widgets, columns, editing, onMove, onHide, onRemove, renderBody }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [drag, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setDrag = (next: DragState | null) => {
    dragRef.current = next;
    setDragState(next);
  };
  const [shaking, setShaking] = useState<string | null>(null);
  const wide = useWide();
  const visible = widgets.filter((w) => !w.is_hidden);

  const cellWidth = () => {
    const width = container.current?.clientWidth ?? 1200;
    return (width - GAP * (columns - 1)) / columns;
  };

  useEffect(() => {
    if (!drag) return;
    const widget = visible.find((w) => w.id === drag.id);
    if (!widget) return;
    // The grid is measured once when the drag starts, not on every pointer event: reading clientWidth
    // inside the move handler would force the browser to recalculate layout dozens of times a second.
    const cell = cellWidth();
    const onMovePointer = (e: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const t = targetCell(widget, e.clientX - drag.startX, e.clientY - drag.startY, cell, ROW_HEIGHT, GAP, columns);
      // Pure arithmetic per event; React re-renders (and the O(W) overlap check runs) only when the
      // pointer has crossed into a different grid cell.
      if (t.x !== current.x || t.y !== current.y) setDrag({ ...current, x: t.x, y: t.y });
    };
    const onUp = async () => {
      const current = dragRef.current;
      setDrag(null);
      if (!current) return;
      const result = moveTo(widget, current.x, current.y, visible, columns);
      if (result.reason === 'unchanged') return;
      if (!result.moved || !(await onMove(widget, current.x, current.y))) {
        setShaking(widget.id);
        setTimeout(() => setShaking(null), 650);
      }
    };
    window.addEventListener('pointermove', onMovePointer);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMovePointer);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag?.id, drag?.startX, drag?.startY]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveByKeyboard = async (widget: WidgetModel, dx: number, dy: number) => {
    const x = Math.max(0, Math.min(columns - widget.width, widget.grid_x + dx));
    const y = Math.max(0, widget.grid_y + dy);
    const result = moveTo(widget, x, y, visible, columns);
    if (!result.moved || !(await onMove(widget, x, y))) {
      setShaking(widget.id);
      setTimeout(() => setShaking(null), 650);
    }
  };

  const dragged = drag ? visible.find((w) => w.id === drag.id) : undefined;
  const ghost = dragged && drag ? { ...dragged, grid_x: drag.x, grid_y: drag.y } : null;
  const ghostBlocked = ghost ? collidesWithAny(ghost, visible, ghost.id) : false;
  const rows = gridRows(ghost ? [...visible, ghost] : visible);

  return (
    <div
      ref={container}
      className={wide ? 'relative grid' : 'flex flex-col gap-4'}
      style={wide ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: `${ROW_HEIGHT}px`, gap: GAP, gridTemplateRows: `repeat(${rows}, ${ROW_HEIGHT}px)` } : undefined}
    >
      {editing && wide
        ? Array.from({ length: rows * columns }, (_, i) => (
            <div key={`cell-${i}`} className="rounded-btn border border-dashed border-line" style={{ gridColumn: (i % columns) + 1, gridRow: Math.floor(i / columns) + 1 }} aria-hidden />
          ))
        : null}
      {ghost && wide ? (
        <div
          className={`pointer-events-none z-20 rounded-card border-2 ${ghostBlocked ? 'border-dashed border-danger bg-danger/10' : 'border-dashed border-ok bg-ok/10'}`}
          style={{ gridColumn: `${ghost.grid_x + 1} / span ${ghost.width}`, gridRow: `${ghost.grid_y + 1} / span ${ghost.height}` }}
          aria-hidden
        />
      ) : null}
      {visible.map((w) => (
        <section
          key={w.id}
          className={`card z-10 flex min-h-0 flex-col overflow-hidden p-6 ${drag?.id === w.id ? 'opacity-60' : ''} ${shaking === w.id ? 'animate-shake border-danger ring-2 ring-danger' : ''}`}
          style={wide ? { gridColumn: `${w.grid_x + 1} / span ${w.width}`, gridRow: `${w.grid_y + 1} / span ${w.height}` } : { minHeight: w.height * ROW_HEIGHT }}
          aria-label={w.title}
        >
          <header className="flex items-center gap-2">
            {editing ? (
              <button
                type="button"
                className="-ml-1 cursor-grab touch-none rounded p-1 text-muted hover:bg-surface-2 active:cursor-grabbing"
                aria-label={`Move ${w.title} (drag, or use arrow keys)`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setDrag({ id: w.id, startX: e.clientX, startY: e.clientY, x: w.grid_x, y: w.grid_y });
                }}
                onKeyDown={(e) => {
                  const map: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
                  if (map[e.key]) {
                    e.preventDefault();
                    void moveByKeyboard(w, ...map[e.key]);
                  }
                }}
              >
                <Icon name="grip" />
              </button>
            ) : null}
            <h2 className="card-title flex-1 truncate">{w.title}</h2>
            {editing ? (
              <>
                <button type="button" className="btn-ghost p-1" onClick={() => onHide(w)} aria-label={`Hide ${w.title}`} title="Hide">
                  <Icon name="eye-off" />
                </button>
                <button type="button" className="btn-ghost p-1 hover:text-danger" onClick={() => onRemove(w)} aria-label={`Remove ${w.title}`} title="Remove">
                  <Icon name="x" />
                </button>
              </>
            ) : null}
          </header>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">{renderBody(w)}</div>
        </section>
      ))}
    </div>
  );
}
