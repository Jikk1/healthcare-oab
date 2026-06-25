import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { config } from '../config/env.js';
import { Unauthorized } from './errors.js';

/**
 * Stateless access tokens (short-lived, ~15 min) + opaque refresh tokens
 * (stored hashed, rotated on use). Access tokens carry the active tenant and
 * role so most requests authorize without a DB round-trip.
 */
export interface AccessClaims extends JWTPayload {
  sub: string; // userId
  org: string; // active organizationId
  role: string; // role within that org
  typ: 'access';
}

const accessSecret = new TextEncoder().encode(config.JWT_ACCESS_SECRET);

export async function signAccessToken(params: {
  userId: string;
  organizationId: string;
  role: string;
}): Promise<string> {
  return new SignJWT({ org: params.organizationId, role: params.role, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(params.userId)
    .setIssuer(config.JWT_ISSUER)
    .setAudience(config.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${config.JWT_ACCESS_TTL}s`)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, {
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
    });
    if (payload.typ !== 'access') throw new Error('wrong token type');
    return payload as AccessClaims;
  } catch {
    throw Unauthorized('Invalid or expired access token');
  }
}
