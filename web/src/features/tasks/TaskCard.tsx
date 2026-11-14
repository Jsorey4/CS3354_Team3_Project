/**
 * @author Aashwat Singh
 * @description A task card on the board, matching tasks.html: title, the feature list it belongs to, "Due
 *   <date>" (or a check mark and "Done <date>"), small checkpoint / comment counters and the assignee's
 *   avatar. Selecting a card shows it in the Task details panel; cards the user may move are draggable,
 *   others show a lock.
 * @traces SE-FR-26, SE-FR-27, SE-FR-07, UC-18
 */
import type { DragEvent } from 'react';
import type { Task, TaskList } from '../../shared/types';
import { formatDate } from '../../shared/format';
import { Avatar, Icon } from '../../shared/ui';
import { isOverdue } from './model';

interface Props {
  task: Task;
  list?: TaskList;
  draggable: boolean;
  selected?: boolean;
  onSelect?: (task: Task) => void;
  onOpen?: (task: Task) => void;
  onDragStart: (e: DragEvent<HTMLElement>, task: Task) => void;
}

export function TaskCard({ task, list, draggable, selected, onSelect, onOpen, onDragStart }: Props) {
  const overdue = isOverdue(task);
  const done = task.status === 'done';
  return (
    <article
      draggable={draggable}
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => onSelect?.(task)}
      onDoubleClick={() => onOpen?.(task)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen?.(task); if (e.key === ' ') { e.preventDefault(); onSelect?.(task); } }}
      tabIndex={0}
      className={`rounded-btn border bg-surface px-3.5 py-3 text-left transition ${selected ? 'border-accent' : 'border-line hover:border-line-strong'} ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
      aria-label={task.title}
      aria-current={selected ? 'true' : undefined}
      data-task-id={task.id}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`flex items-center gap-2 text-sm font-semibold leading-5 ${done ? 'text-body' : 'text-ink'}`}>
          {done ? <Icon name="check-circle" className="h-4 w-4 text-ok" /> : null}
          {task.title}
        </p>
        {!draggable ? <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 text-muted" title="Only the assignee or a manager can move this task" /> : null}
      </div>
      <p className="mt-0.5 truncate text-xs leading-4 text-muted">{list?.name ?? 'No list'}{task.tags.length ? ` · #${task.tags.slice(0, 2).join(' #')}` : ''}</p>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className={`text-xs leading-4 ${overdue ? 'font-semibold text-danger' : done ? 'text-muted' : 'text-body'}`}>
          {done ? `Done ${formatDate(task.completed_at, { year: undefined })}` : `${overdue ? 'Overdue · ' : 'Due '}${formatDate(task.due_date, { year: undefined })}`}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted">
          {task.soft_deadlines_total > 0 ? (
            <span className="flex items-center gap-0.5" title={`${task.soft_deadlines_done}/${task.soft_deadlines_total} soft deadlines done`}><Icon name="target" className="h-3 w-3" />{task.soft_deadlines_done}/{task.soft_deadlines_total}</span>
          ) : null}
          {task.comment_count > 0 ? <span className="flex items-center gap-0.5"><Icon name="comment" className="h-3 w-3" />{task.comment_count}</span> : null}
          {task.assignee ? <Avatar name={task.assignee.display_name || task.assignee.username} url={task.assignee.avatar_url} size="h-[22px] w-[22px]" text="text-[9px]" /> : null}
        </span>
      </div>
    </article>
  );
}
