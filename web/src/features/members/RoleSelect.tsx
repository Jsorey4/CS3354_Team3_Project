/**
 * @author Aashwat Singh
 * @description Drop-down to change a member's role. It only offers roles the caller may grant (managers
 *   cannot hand out "owner") and shows the server's answer, e.g. "Project must have at least one owner".
 * @traces SE-FR-30, SE-NFR-11, UC-20
 */
import type { Role } from '../../shared/types';
import { ROLE_LABEL, grantableRoles } from '../../shared/permissions';

export function RoleSelect({ value, callerRole, onChange, disabled, label }: { value: Role; callerRole: Role; onChange: (role: Role) => void; disabled?: boolean; label: string }) {
  const options = new Set<Role>(grantableRoles(callerRole));
  options.add(value);
  const locked = disabled || (value === 'owner' && callerRole !== 'owner');
  return (
    <select className="input w-auto py-1.5 text-xs font-semibold" value={value} disabled={locked} aria-label={label} onChange={(e) => onChange(e.target.value as Role)}>
      {(['owner', 'manager', 'member'] as Role[]).filter((r) => options.has(r)).map((r) => (
        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
      ))}
    </select>
  );
}
