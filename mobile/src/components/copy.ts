/* Shared on-screen wording helpers. */

/** Auth errors in words a person can act on. */
export function readableAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('fetch') || m.includes('network') || m.includes('timed out') || m.includes('load failed')) {
    return "Can't reach BUILT right now. Check your connection and try again.";
  }
  if (m.includes('invalid login')) return "That email and password don't match. Try again.";
  return message;
}

/** Time-of-day greeting word. */
export function greetingWord(h = new Date().getHours()): string {
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
