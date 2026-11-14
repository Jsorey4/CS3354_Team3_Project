/**
 * @author Aashwat Singh
 * @description Unit tests for Membership.canAssignTasks, edit rights and the optimistic Task.moveTo mirror.
 * @traces SE-FR-26, SE-FR-27, UC-18
 */
import { describe, expect, it } from 'vitest';
import type { Task } from '../../shared/types';
import { Membership, applyMove, canEditTask, filterTasks, groupByStatus, normalizeTags } from './model';

const t = (id: string, status: Task['status'], position: number, assignee: string | null = null): Task => ({
  id, project_id: 'p', list_id: null, title: id, description: '', status, priority: 'medium', assignee_id: assignee, assignee: null,
  due_date: '2026-12-01T17:00:00Z', position, tags: id === 'b' ? ['ux'] : [], estimated_hours: null, assigned_hours: null, actual_hours: 0, completed_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', soft_deadlines_total: 0, soft_deadlines_done: 0, next_soft_deadline_at: null, comment_count: 0,
});

describe('UC-18 task rules', () => {
  it('only owners and managers can assign tasks', () => {
    expect(Membership.canAssignTasks('owner')).toBe(true);
    expect(Membership.canAssignTasks('manager')).toBe(true);
    expect(Membership.canAssignTasks('member')).toBe(false);
    expect(Membership.canAssignTasks(undefined)).toBe(false);
  });
  it('members may edit only their own tasks', () => {
    expect(canEditTask('member', { assignee_id: 'me' }, 'me')).toBe(true);
    expect(canEditTask('member', { assignee_id: 'you' }, 'me')).toBe(false);
    expect(canEditTask('manager', { assignee_id: 'you' }, 'me')).toBe(true);
  });
  it('moveTo reorders the target column and renumbers positions', () => {
    const tasks = [t('a', 'todo', 0), t('b', 'todo', 1), t('c', 'done', 0)];
    const moved = groupByStatus(applyMove(tasks, 'c', 'todo', 1));
    expect(moved.todo.map((x) => x.id)).toEqual(['a', 'c', 'b']);
    expect(moved.todo.map((x) => x.position)).toEqual([0, 1, 2]);
    expect(moved.done).toHaveLength(0);
  });
  it('filters by assignee and tag', () => {
    const tasks = [t('a', 'todo', 0, 'me'), t('b', 'todo', 1)];
    expect(filterTasks(tasks, { search: '', assignee: 'me', tag: '', listId: '' }, 'me').map((x) => x.id)).toEqual(['a']);
    expect(filterTasks(tasks, { search: '', assignee: 'all', tag: 'ux', listId: '' }, 'me').map((x) => x.id)).toEqual(['b']);
  });
  it('normalizes tags', () => {
    expect(normalizeTags('Frontend, frontend , UX,')).toEqual(['frontend', 'ux']);
  });
});
