/**
 * @author Aashwat Singh
 * @description Unit tests for the task form's required fields (title and final due date).
 * @traces SE-FR-26, UC-18
 */
import { describe, expect, it } from 'vitest';
import { validateTaskForm } from './validation';

describe('UC-18 task form validation', () => {
  it('UC-18: requires a due date when creating a task (SE-FR-26)', () => {
    const result = validateTaskForm({ title: 'Write tests', due: '' });
    expect(result.errors).toEqual({ due_date: 'Due date is required' });
    expect(result.value).toBeUndefined();
  });
  it('UC-18: reports both missing title and missing due date at once', () => {
    expect(validateTaskForm({ title: '   ', due: '  ' }).errors).toEqual({ title: 'Title is required', due_date: 'Due date is required' });
  });
  it('UC-18: rejects a due date the browser cannot parse', () => {
    expect(validateTaskForm({ title: 'x', due: 'not-a-date' }).errors.due_date).toBe('Enter a valid due date and time');
  });
  it('UC-18: returns the trimmed title and an ISO due date when valid', () => {
    const result = validateTaskForm({ title: '  Ship it ', due: '2026-11-20T17:00' });
    expect(result.errors).toEqual({});
    expect(result.value?.title).toBe('Ship it');
    expect(result.value?.due_date).toBe(new Date('2026-11-20T17:00').toISOString());
  });
});
