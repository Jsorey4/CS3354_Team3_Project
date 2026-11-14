/**
 * @author Myoram Langwang
 * @description Unit tests for AABB overlap detection and Widget.moveTo snap-back.
 * @traces SE-FR-24, SE-NFR-07, UC-17
 */
import { describe, expect, it } from 'vitest';
import { Widget, collidesWithAny, targetCell } from './model';

const a = { id: 'a', grid_x: 0, grid_y: 0, width: 8, height: 3 };
const b = { id: 'b', grid_x: 8, grid_y: 0, width: 4, height: 3 };
const hidden = { id: 'h', grid_x: 0, grid_y: 6, width: 4, height: 2, is_hidden: true };

describe('UC-17 / SE-NFR-07 widget layout', () => {
  it('detects overlap and allows touching edges', () => {
    expect(Widget.overlaps(a, b)).toBe(false);
    expect(Widget.overlaps(a, { ...b, grid_x: 7 })).toBe(true);
  });
  it('snaps back on overlap', () => {
    const result = Widget.moveTo(b, 6, 1, [a, b]);
    expect(result.moved).toBe(false);
    expect(result.reason).toBe('overlap');
    expect([result.widget.grid_x, result.widget.grid_y]).toEqual([8, 0]);
  });
  it('moves to a free cell, ignoring hidden widgets', () => {
    const result = Widget.moveTo(b, 0, 6, [a, b, hidden]);
    expect(result.moved).toBe(true);
    expect([result.widget.grid_x, result.widget.grid_y]).toEqual([0, 6]);
  });
  it('refuses to leave the 12-column grid', () => {
    expect(Widget.moveTo(b, 10, 5, [a, b]).reason).toBe('out_of_bounds');
  });
  it('converts a pixel drag into grid cells', () => {
    expect(targetCell(b, -250, 200, 80, 84, 16)).toEqual({ x: 5, y: 2 });
  });
  it('UC-17: one overlap check is a single O(W) pass over plain data (SE-NFR-07)', () => {
    // 300 widgets in a non-overlapping 3-column layout; count how often their positions are read.
    let reads = 0;
    const widgets = Array.from({ length: 300 }, (_, i) =>
      new Proxy({ id: `w${i}`, grid_x: (i % 3) * 4, grid_y: Math.floor(i / 3) * 3, width: 4, height: 3 }, {
        get(target, key, receiver) {
          if (key === 'grid_x') reads += 1;
          return Reflect.get(target, key, receiver);
        },
      }),
    );
    expect(collidesWithAny({ grid_x: 0, grid_y: 5000, width: 4, height: 3 }, widgets)).toBe(false);
    expect(reads).toBeLessThanOrEqual(2 * widgets.length); // each widget is looked at once, never pairwise
    reads = 0;
    expect(collidesWithAny({ grid_x: 0, grid_y: 0, width: 4, height: 3 }, widgets)).toBe(true);
    expect(reads).toBeLessThanOrEqual(2); // stops at the first overlap
    // Dragging re-checks only when the pointer enters a new cell: equal targets are detected as unchanged.
    expect(Widget.moveTo(widgets[0], 0, 0, widgets).reason).toBe('unchanged');
  });
});
