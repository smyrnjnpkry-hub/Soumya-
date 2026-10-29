/** Random id. `crypto.randomUUID` needs a secure context, so fall back to getRandomValues (e.g. testing over LAN http). */
export function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}
