/**
 * @author Aashwat Singh
 * @description Invite an existing ProjectForge user to the project by username or email and choose their
 *   starting role. Only owners can invite someone directly as an owner.
 * @traces SE-FR-30, UC-19
 */
import { useState } from 'react';
import type { Member, Role } from '../../shared/types';
import { ROLE_LABEL, grantableRoles } from '../../shared/permissions';
import { Alert, Field, Modal, RetryBanner } from '../../shared/ui';
import { useSave } from '../../shared/useSave';
import { memberController } from './memberController';

export function InviteMemberModal({ open, projectId, callerRole, onClose, onInvited }: { open: boolean; projectId: string; callerRole: Role; onClose: () => void; onInvited: (m: Member) => void }) {
  const [identifier, setIdentifier] = useState('');
  const [role, setRole] = useState<Role>('member');
  const save = useSave(() => memberController.invite(projectId, identifier.trim(), role), (m) => {
    onInvited(m);
    setIdentifier('');
    setRole('member');
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite to project"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!identifier.trim() || save.saving} onClick={() => void save.run()}>{save.saving ? 'Inviting…' : 'Send invite'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <RetryBanner error={save.networkError} onRetry={save.retry} onCancel={save.cancel} busy={save.saving} />
        {save.error && !save.fieldErrors.identifier ? <Alert>{save.error.detail}</Alert> : null}
        <Field label="Username or email" error={save.fieldErrors.identifier} htmlFor="inv-id">
          <input id="inv-id" className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="preethi or preethi@example.com" />
        </Field>
        <Field label="Role" htmlFor="inv-role">
          <select id="inv-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {grantableRoles(callerRole).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
