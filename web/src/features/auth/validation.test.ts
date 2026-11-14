/**
 * @author Tyler Gaines
 * @description Unit tests for the sign-up rules shared with the server.
 * @traces UC-08, SE-FR-11
 */
import { describe, expect, it } from 'vitest';
import { isValidMfaCode, passwordStrength, validateSignup } from './validation';

describe('UC-08 sign-up validation', () => {
  it('reports every failing field', () => {
    const errors = validateSignup({ username: 'ab', email: 'nope', password: 'short', confirm: 'x' });
    expect(Object.keys(errors).sort()).toEqual(['confirm', 'email', 'password', 'username']);
  });
  it('accepts a valid form', () => {
    expect(validateSignup({ username: 'new_user', email: 'a@example.com', password: 'Str0ng!Pass', confirm: 'Str0ng!Pass' })).toEqual({});
  });
  it('scores password strength 0-5', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('Str0ng!Pass')).toBe(5);
  });
  it('accepts only 6-digit codes', () => {
    expect(isValidMfaCode('123456')).toBe(true);
    expect(isValidMfaCode('12345a')).toBe(false);
  });
});
