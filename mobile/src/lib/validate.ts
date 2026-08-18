export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export function passwordProblem(v: string): string | null {
  if (v.length < 8) return 'Use at least 8 characters.';
  if (!/[a-zA-Z]/.test(v) || !/\d/.test(v)) return 'Include at least one letter and one number.';
  return null;
}

export function requiredName(v: string, field: string): string | null {
  return v.trim().length >= 2 ? null : `Enter your ${field}.`;
}
