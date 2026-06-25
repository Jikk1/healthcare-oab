import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  encryptField,
  decryptField,
  encryptNullable,
  decryptNullable,
  sha256,
  generateToken,
  safeEqual,
} from '../src/shared/crypto.js';

describe('crypto', () => {
  it('hashes and verifies passwords (argon2id)', async () => {
    const hash = await hashPassword('Correct-Horse-Battery-Staple-2026');
    expect(hash).not.toContain('Correct-Horse');
    expect(await verifyPassword(hash, 'Correct-Horse-Battery-Staple-2026')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
  });

  it('encrypts PHI and decrypts back to plaintext', () => {
    const ct = encryptField('Морозов');
    expect(ct).not.toBe('Морозов');
    expect(ct.startsWith('gcm.v1')).toBe(true);
    expect(decryptField(ct)).toBe('Морозов');
  });

  it('produces a fresh ciphertext per call (random IV) but same plaintext', () => {
    const a = encryptField('same');
    const b = encryptField('same');
    expect(a).not.toBe(b); // non-deterministic IV
    expect(decryptField(a)).toBe(decryptField(b));
  });

  it('handles nullable PHI columns', () => {
    expect(encryptNullable(null)).toBeNull();
    expect(encryptNullable(undefined)).toBeNull();
    const ct = encryptNullable('1980-01-01');
    expect(decryptNullable(ct)).toBe('1980-01-01');
    expect(decryptNullable(null)).toBeNull();
  });

  it('rejects tampered ciphertext (GCM auth tag)', () => {
    const [prefix, iv, body, tag] = encryptField('secret').split(':');
    // Flip the first IV char (12-byte IV → no base64 padding, every char is significant).
    const flipped = (iv![0] === 'A' ? 'B' : 'A') + iv!.slice(1);
    const tampered = [prefix, flipped, body, tag].join(':');
    expect(() => decryptField(tampered)).toThrow();
  });

  it('sha256 is stable and 64 hex chars', () => {
    const h = sha256('token');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256('token')).toBe(h);
  });

  it('generateToken returns unique url-safe tokens', () => {
    const a = generateToken(32);
    const b = generateToken(32);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('safeEqual compares without leaking via length-equal inputs', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
