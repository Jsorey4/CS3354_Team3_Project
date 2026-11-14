/**
 * @author Tyler Gaines
 * @description The same sign-up rules the backend enforces, checked instantly as the user types: username
 *   3-30 letters / numbers / underscores, a valid email, and a password with at least 8 characters, an
 *   uppercase letter, a lowercase letter, a digit and a special character.
 * @traces UC-08, UC-11, SE-FR-11
 */

export const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;
// Checked only on input of at most 254 characters (the longest valid address), so its cost is bounded.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 254;

export interface PasswordRule {
  id: string;
  label: string;
  met: boolean;
}

export function passwordRules(password: string): PasswordRule[] {
  return [
    { id: 'length', label: 'At least 8 characters', met: password.length >= 8 },
    { id: 'upper', label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { id: 'lower', label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { id: 'digit', label: 'One number', met: /\d/.test(password) },
    { id: 'special', label: 'One special character', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function passwordStrength(password: string): number {
  return passwordRules(password).filter((r) => r.met).length;
}

export function validateUsername(username: string): string | undefined {
  if (!USERNAME_RE.test(username.trim())) return 'Username must be 3-30 characters: letters, numbers or underscores';
  return undefined;
}

export function validateEmail(email: string): string | undefined {
  const value = email.trim();
  if (value.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(value)) return 'Enter a valid email address';
  return undefined;
}

export function validatePassword(password: string): string | undefined {
  const missing = passwordRules(password).filter((r) => !r.met);
  if (missing.length === 0) return undefined;
  return `Password needs: ${missing.map((r) => r.label.toLowerCase()).join(', ')}`;
}

export interface SignupForm {
  username: string;
  email: string;
  password: string;
  confirm: string;
}

export function validateSignup(form: SignupForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const u = validateUsername(form.username);
  const e = validateEmail(form.email);
  const p = validatePassword(form.password);
  if (u) errors.username = u;
  if (e) errors.email = e;
  if (p) errors.password = p;
  if (form.confirm !== form.password) errors.confirm = 'Passwords do not match';
  return errors;
}

export function isValidMfaCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}
