/* Base64 → bytes without native modules (Hermes has no atob on older
   engines and Buffer isn't available). Pure, unit tested. */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i;
  t['-'.charCodeAt(0)] = 62; // base64url
  t['_'.charCodeAt(0)] = 63;
  return t;
})();

/** Strip a data: prefix and whitespace. */
export function stripDataUri(b64: string): string {
  return b64.replace(/^data:[^;,]+;base64,/, '').replace(/\s+/g, '');
}

export function base64ToBytes(input: string): Uint8Array {
  const s = stripDataUri(input).replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < s.length; i++) {
    const v = LOOKUP[s.charCodeAt(i)];
    if (v < 0) throw new Error('Not base64');
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

/** Rough size in bytes of a base64 string. */
export function base64Bytes(b64: string): number {
  const s = stripDataUri(b64);
  return Math.floor((s.length * 3) / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0);
}
