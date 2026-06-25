import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import argon2 from 'argon2';
import { config } from '../config/env.js';

/**
 * Cryptographic primitives used across the app:
 *  - argon2id password hashing (memory-hard, tuned via env)
 *  - AES-256-GCM authenticated field encryption for PHI at rest
 *  - SHA-256 hashing for opaque tokens (refresh/reset/api-key lookups)
 *  - constant-time comparison helpers
 *
 * In production the PHI key and JWT secrets come from a KMS/Vault, never env.
 */

const ENC_KEY = (() => {
  const raw = Buffer.from(config.PHI_ENCRYPTION_KEY, 'base64');
  // Accept a 32-byte base64 key; otherwise derive a stable 32-byte key.
  if (raw.length === 32) return raw;
  return createHash('sha256').update(config.PHI_ENCRYPTION_KEY).digest();
})();

const GCM_IV_BYTES = 12;
const ENC_PREFIX = 'gcm.v1';

// ---------- Passwords ----------

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: config.ARGON_MEMORY_COST,
    timeCost: config.ARGON_TIME_COST,
    parallelism: config.ARGON_PARALLELISM,
  });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// ---------- Field encryption (AES-256-GCM) ----------

export function encryptField(plaintext: string): string {
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENC_PREFIX, iv.toString('base64'), ct.toString('base64'), tag.toString('base64')].join(
    ':',
  );
}

export function decryptField(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== ENC_PREFIX) {
    throw new Error('Malformed ciphertext');
  }
  const iv = Buffer.from(parts[1]!, 'base64');
  const ct = Buffer.from(parts[2]!, 'base64');
  const tag = Buffer.from(parts[3]!, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export function encryptNullable(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === '' ? null : encryptField(value);
}

export function decryptNullable(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : decryptField(value);
}

// ---------- Token generation & hashing ----------

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
