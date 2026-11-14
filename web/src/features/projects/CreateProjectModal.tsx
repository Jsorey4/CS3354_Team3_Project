/**
 * @author Saaqib Shaik
 * @description The "New project" form. Requires a name, status, type (defaulting to the user's preferred
 *   mode) and a future deadline, and accepts any number of member usernames. If the server reports unknown
 *   usernames, they are listed with a one-click "remove" so the creator can fix the list and resubmit.
 * @traces SE-FR-16, SE-NFR-09, UC-12
 */
import { useEffect, useState } from 'react';
import type { ProjectDetail, ProjectStatus, ProjectType } from '../../shared/types';
import { fromLocalInput, toLocalInput } from '../../shared/format';
import { Alert, Badge, Field, Icon, Modal, RetryBanner } from '../../shared/ui';
import { useSave } from '../../shared/useSave';
import { ColorPicker } from './ColorPicker';
import { CARD_COLORS, PROJECT_STATUSES, PROJECT_TYPES, parseUsernames, validateProjectForm } from './model';
import { projectController } from './projectController';

interface Props {
  open: boolean;
  defaultType: ProjectType;
  onClose: () => void;
  onCreated: (project: ProjectDetail) => void;
}

export function CreateProjectModal({ open, defaultType, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [projectType, setProjectType] = useState<ProjectType>(defaultType);
  const [deadline, setDeadline] = useState(() => toLocalInput(new Date(Date.now() + 30 * 86_400_000).toISOString()));
  const [memberText, setMemberText] = useState('');
  const [color, setColor] = useState(CARD_COLORS[0]);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [unknown, setUnknown] = useState<string[]>([]);

  useEffect(() => setProjectType(defaultType), [defaultType]);

  const members = parseUsernames(memberText);
  const save = useSave(
    () =>
      projectController.create({
        name,
        description,
        status,
        project_type: projectType,
        deadline: fromLocalInput(deadline) ?? '',
        members,
        card_color: color,
      }),
    (project) => {
      onCreated(project);
      setName('');
      setDescription('');
      setMemberText('');
      setUnknown([]);
    },
  );

  useEffect(() => {
    const body = save.error?.body as { unknown_members?: string[] } | undefined;
    setUnknown(body?.unknown_members ?? []);
  }, [save.error]);

  const submit = async () => {
    const errors = validateProjectForm({ name, deadline, project_type: projectType });
    setClientErrors(errors);
    if (Object.keys(errors).length === 0) await save.run();
  };

  const removeUnknown = (username: string) => {
    setMemberText(members.filter((m) => m.toLowerCase() !== username.toLowerCase()).join(', '));
    setUnknown((u) => u.filter((x) => x !== username));
  };

  const errors = { ...save.fieldErrors, ...clientErrors };
  return (
    <Modal
      open={open}
      title="New project"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={save.saving}>
            {save.saving ? 'Creating…' : 'Create project'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <RetryBanner error={save.networkError} onRetry={save.retry} onCancel={save.cancel} busy={save.saving} />
        {save.error && unknown.length === 0 && !Object.keys(save.fieldErrors).length ? <Alert>{save.error.detail}</Alert> : null}
        {unknown.length > 0 ? (
          <Alert tone="warn" title="Some usernames were not found">
            <p>Remove them, or ask them to sign up first and then invite them from the People page.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {unknown.map((u) => (
                <button key={u} type="button" onClick={() => removeUnknown(u)} className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-surface px-2 py-0.5 text-xs font-semibold">
                  @{u} <Icon name="x" className="h-3 w-3" />
                </button>
              ))}
            </div>
          </Alert>
        ) : null}
        <Field label="Project name" error={errors.name} htmlFor="p-name">
          <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Capstone mobile app" />
        </Field>
        <Field label="Description" htmlFor="p-desc">
          <textarea id="p-desc" className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type" error={errors.project_type}>
            <div className="flex gap-1">
              {PROJECT_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => setProjectType(t.value)} aria-pressed={projectType === t.value}
                  className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${projectType === t.value ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:bg-surface-2'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Status" error={errors.status} htmlFor="p-status">
            <select id="p-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Deadline" error={errors.deadline} htmlFor="p-deadline">
            <input id="p-deadline" type="datetime-local" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
        <Field label="Members (usernames)" error={errors.members} hint="Separate with commas or spaces. You are added as the owner automatically." htmlFor="p-members">
          <textarea id="p-members" className="input min-h-[64px] font-mono text-xs" value={memberText} onChange={(e) => setMemberText(e.target.value)} placeholder="tyler, staff, preethi" />
        </Field>
        {members.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <Badge key={m} tone={unknown.includes(m) ? 'danger' : 'neutral'} icon={unknown.includes(m) ? 'alert' : 'users'}>
                @{m}
              </Badge>
            ))}
            <span className="text-xs text-muted">{members.length} member{members.length === 1 ? '' : 's'}</span>
          </div>
        ) : null}
        <Field label="Card color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </div>
    </Modal>
  );
}
