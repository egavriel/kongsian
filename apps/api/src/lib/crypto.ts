/**
 * Crypto helpers — OTPs, session tokens, hashing.
 * Uses Web Crypto API only (no Node-only deps), compatible with Workers runtime.
 */

/** 6-digit numeric OTP. */
export function generateOtpCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  // Uniform modulo is acceptable for OTPs (slight bias, irrelevant for 6 digits).
  return String(buf[0] % 1000000).padStart(6, "0");
}

/** Opaque session token — base64url-encoded 32 random bytes. */
export async function generateSessionToken(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Hash an OTP or session token with HMAC-SHA256.
 * The HMAC key (env OTP_HMAC_KEY) binds the hash to this deployment, so
 * a leaked DB alone cannot be brute-forced offline.
 */
export async function hashOtpCode(code: string, hmacKey: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(hmacKey || "kongsian-dev-key-do-not-use-in-prod"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(code));
  return base64UrlEncode(new Uint8Array(sig));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
