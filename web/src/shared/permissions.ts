/**
 * @author Aashwat Singh (roles & membership)
 * @description Small helpers that decide which buttons to SHOW for a given project role. They only shape the
 *   screen - the backend re-checks every action, so hiding a button is never the real protection.
 * @traces SE-FR-26, SE-FR-30, SE-NFR-02, UC-01, UC-18, UC-19, UC-20
 */
import type { Role } from './types';

export const MANAGER_ROLES: readonly Role[] = ['owner', 'manager'];
export const ALL_ROLES: readonly Role[] = ['owner', 'manager', 'member'];

export function hasProjectRole(role: Role | null | undefined, allowedRoles: readonly Role[]): boolean {
  return role != null && allowedRoles.includes(role);
}

export const isManager = (role: Role | null | undefined): boolean => hasProjectRole(role, MANAGER_ROLES);
export const isOwner = (role: Role | null | undefined): boolean => role === 'owner';

/** Roles the caller may hand out: only owners can grant ownership. */
export function grantableRoles(callerRole: Role | null | undefined): Role[] {
  if (callerRole === 'owner') return ['owner', 'manager', 'member'];
  if (callerRole === 'manager') return ['manager', 'member'];
  return [];
}

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', manager: 'Manager', member: 'Member' };
