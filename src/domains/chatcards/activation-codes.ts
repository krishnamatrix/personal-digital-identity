import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Activation codes for verified-access ChatCards.
 *
 *  - 16 characters from Crockford's base32 alphabet (no I, L, O or U, so nothing is misread
 *    when printed), shown as four groups: K7QF-9XMB-2TRA-WE4H. That is 80 random bits from the
 *    operating system's CSPRNG: guessing one is not feasible, and the database also limits
 *    every account to 10 attempts per 15 minutes.
 *  - Only the SHA-256 of the normalized code is stored. A salt adds nothing at 80 bits of
 *    entropy (no dictionary to precompute), and an unsalted hash lets the database find the
 *    one matching row without ever being able to list codes.
 *  - The raw code exists only in the server action's response at issue time, and in the file
 *    the owner downloads. It is never logged or stored.
 */

export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 16;

export function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  // 256 is a multiple of 32, so masking the low five bits is unbiased.
  for (const b of bytes) out += CODE_ALPHABET[b & 31];
  return formatCode(out);
}

export function formatCode(normalized: string): string {
  return normalized.match(/.{1,4}/g)!.join("-");
}

/** What a person typed -> the canonical 16 characters, or null if it cannot be a code. */
export function normalizeCode(input: string): string | null {
  const s = String(input ?? "")
    .toUpperCase()
    .replace(/[\s\-–—_.]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

export function hashCode(normalized: string): string {
  return createHash("sha256")
    .update(`folioone-chatcard:${normalized}`)
    .digest("hex");
}

/** The last four characters: lets the owner recognise a printed code in their list. */
export function codeHint(normalized: string): string {
  return normalized.slice(-4);
}

export type IssuedCode = { code: string; hash: string; hint: string };

export function issueCodes(count: number): IssuedCode[] {
  const seen = new Set<string>();
  const out: IssuedCode[] = [];
  while (out.length < count) {
    const code = generateCode();
    const normalized = normalizeCode(code)!;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push({ code, hash: hashCode(normalized), hint: codeHint(normalized) });
  }
  return out;
}
