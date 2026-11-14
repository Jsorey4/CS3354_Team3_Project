/**
 * @author Aashwat Singh
 * @description Create / edit task form. Title and final due date are required (UC-18). The assignee picker and the estimated / assigned hours are only
 *   editable for owners and managers (Membership.canAssignTasks); members editing their own task can change
 *   the status, priority, list, due date, tags and description. The server enforces the same rules.
 * @traces SE-FR-26, SE-FR-27, SE-FR-04, UC-18, UC-03
 */
import { useState } from 'react';
import type { Member, Role, TaskDetail, TaskInput, TaskList, TaskPriority, TaskStatus } from '../../shared/types';
import { titleCase, toLocalInput } from '../../shared/format';
import { Alert, Field, Modal, RetryBanner } from '../../shared/ui';
import { useSave } from '../../shared/useSave';
import { BOARD_COLUMNS, Membership, PRIORITIES, normalizeTags } from './model';
import { taskController } from './taskController';
import { type TaskFormErrors, validateTaskForm } from './validation';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  role: Role;
  members: Member[];
  lists: TaskList[];
  task?: TaskDetail;
  defaultStatus?: TaskStatus;
  onSaved: (task: TaskDetail) => void;
}

export function TaskForm({ open, onClose, projectId, role, members, lists, task, defaultStatus = 'todo', onSaved }: Props) {
  const canAssign = Membership.canAssignTasks(role);
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [assigneeId, setAssigneeId] = useState<string>(task?.assignee_id ?? '');
  const [listId, setListId] = useState<string>(task?.list_id ?? lists[0]?.id ?? '');
  const [due, setDue] = useState(toLocalInput(task?.due_date));
  const [tags, setTags] = useState((task?.tags ?? []).join(', '));
  const [estimated, setEstimated] = useState(task?.estimated_hours?.toString() ?? '');
  const [assigned, setAssigned] = useState(task?.assigned_hours?.toString() ?? '');
  const [formErrors, setFormErrors] = useState<TaskFormErrors>({});

  const buildInput = (): TaskInput => {
    const checked = validateTaskForm({ title, due }).value;
    const input: TaskInput = {
      title: checked?.title ?? title.trim(),
      description,
      status,
      priority,
      list_id: listId || null,
      due_date: checked?.due_date,
      tags: normalizeTags(tags),
    };
    if (canAssign) {
      input.assignee_id = assigneeId || null;
      input.estimated_hours = estimated === '' ? null : Number(estimated);
      input.assigned_hours = assigned === '' ? null : Number(assigned);
    }
    return input;
  };

  const save = useSave(() => (task ? taskController.update(task.id, buildInput()) : taskController.create(projectId, buildInput())), (saved) => {
    onSaved(saved);
    if (!task) {
      setTitle('');
      setDescription('');
      setTags('');
    }
  });

  const submit = () => {
    const { errors } = validateTaskForm({ title, due });
    setFormErrors(errors);
    if (errors.title || errors.due_date) return;  // UC-18: nothing is sent until both required fields are set
    void save.run();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? 'Edit task' : 'New task'}
      wide
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={save.saving}>{save.saving ? 'Saving…' : task ? 'Save changes' : 'Create task'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <RetryBanner error={save.networkError} onRetry={save.retry} onCancel={save.cancel} busy={save.saving} />
        {save.error && !Object.keys(save.fieldErrors).length ? <Alert>{save.error.detail}</Alert> : null}
        <Field label="Title" error={formErrors.title ?? save.fieldErrors.title} htmlFor="t-title">
          <input id="t-title" className="input" value={title} maxLength={200} required aria-required="true" onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description (Markdown)" htmlFor="t-desc" hint="**bold**, *italic*, `code`, - lists">
          <textarea id="t-desc" className="input min-h-[96px]" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status" htmlFor="t-status">
            <select id="t-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {BOARD_COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Priority" htmlFor="t-priority">
            <select id="t-priority" className="input" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
            </select>
          </Field>
          <Field label="Feature list" htmlFor="t-list">
            <select id="t-list" className="input" value={listId} onChange={(e) => setListId(e.target.value)}>
              <option value="">No list</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assignee" htmlFor="t-assignee" error={save.fieldErrors.assignee_id} hint={canAssign ? undefined : 'Only owners and managers can assign tasks.'}>
            <select id="t-assignee" className="input" value={assigneeId} disabled={!canAssign} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name} (@{m.username})</option>)}
            </select>
          </Field>
          <Field label="Final due date" htmlFor="t-due" error={formErrors.due_date ?? save.fieldErrors.due_date}>
            <input id="t-due" type="datetime-local" className="input" value={due} required aria-required="true" onChange={(e) => { setDue(e.target.value); if (formErrors.due_date) setFormErrors((f) => ({ ...f, due_date: undefined })); }} />
          </Field>
        </div>
        <Field label="Tags" htmlFor="t-tags" hint="Comma separated, up to 10" error={save.fieldErrors.tags}>
          <input id="t-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="frontend, ux" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Estimated hours" htmlFor="t-est" error={save.fieldErrors.estimated_hours} hint={canAssign ? undefined : 'Set by owners and managers'}>
            <input id="t-est" type="number" min={0} step="0.25" className="input" value={estimated} disabled={!canAssign} onChange={(e) => setEstimated(e.target.value)} />
          </Field>
          <Field label="Assigned hours" htmlFor="t-assigned" error={save.fieldErrors.assigned_hours} hint={canAssign ? undefined : 'Set by owners and managers'}>
            <input id="t-assigned" type="number" min={0} step="0.25" className="input" value={assigned} disabled={!canAssign} onChange={(e) => setAssigned(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
