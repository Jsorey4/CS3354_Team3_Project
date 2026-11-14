/**
 * @author Saaqib Shaik
 * @description One project card on the Projects screen, matching projects.html: name with the School /
 *   Personal / Work mode badge, member avatars, "Due <date>" and "<n>% done", and a completion bar in the
 *   card's own color. Cards are draggable to reorder (arrow buttons do the same for keyboard users) and the
 *   palette button recolors them; both are saved per user for future sessions.
 * @traces SE-FR-16, SE-FR-17, SE-FR-18, SE-NFR-09, UC-13
 */
import { useState, type DragEvent } from 'react';
import type { Project } from '../../shared/types';
import { formatDate } from '../../shared/format';
import { AvatarStack, Icon, ModeBadge, ProgressBar, RoleBadge } from '../../shared/ui';
import { ColorPicker } from './ColorPicker';
import { deadlineCountdown } from './model';

interface Props {
  project: Project;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onRecolor: (hex: string) => void;
  onMove: (newOrder: number) => void;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDropOn: (e: DragEvent<HTMLElement>) => void;
}

export function ProjectCard({ project, index, total, selected, onSelect, onOpen, onRecolor, onMove, onDragStart, onDropOn }: Props) {
  const [picking, setPicking] = useState(false);
  const [over, setOver] = useState(false);
  const due = deadlineCountdown(project.deadline);
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); onDropOn(e); }}
      onClick={onSelect}
      className={`card group relative cursor-pointer px-6 pb-6 pt-5 transition ${selected ? 'border-accent' : 'hover:border-line-strong'} ${over ? 'ring-2 ring-accent' : ''}`}
      aria-label={project.name}
      aria-current={selected ? 'true' : undefined}
      data-project-id={project.id}
    >
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} className="min-w-0 truncate text-left text-lg font-bold leading-[26px] text-ink hover:underline">
          {project.name}
        </button>
        <ModeBadge mode={project.project_type} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <AvatarStack people={project.members_preview.map((m) => ({ name: m.display_name || m.username, url: m.avatar_url }))} max={4} />
        <span className="flex items-center gap-1.5">
          <RoleBadge role={project.my_role} />
          <span className="flex opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
            <button type="button" className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); onMove(index - 1); }} disabled={index === 0} aria-label="Move card earlier"><Icon name="chevron-left" /></button>
            <button type="button" className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); onMove(index + 1); }} disabled={index >= total - 1} aria-label="Move card later"><Icon name="chevron-right" /></button>
            <button type="button" className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); setPicking((v) => !v); }} aria-label="Change card color" aria-expanded={picking}><Icon name="palette" /></button>
          </span>
        </span>
      </div>
      {picking ? (
        <div className="mt-3 rounded-btn border border-line bg-surface-2 p-3" onClick={(e) => e.stopPropagation()}>
          <ColorPicker value={project.card_color} onChange={(hex) => { onRecolor(hex); setPicking(false); }} />
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className={due.overdue ? 'font-semibold text-danger' : 'text-body'} title={due.text}>Due {formatDate(project.deadline, { year: undefined })}</span>
        <span className="font-bold text-ink">{Math.round(project.progress_pct)}% done</span>
      </div>
      <div className="mt-2.5"><ProgressBar value={project.progress_pct} color={project.card_color} /></div>
    </article>
  );
}
