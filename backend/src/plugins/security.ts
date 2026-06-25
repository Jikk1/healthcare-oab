import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { config } from '../config/env.js';

/**
 * Baseline transport/browser security:
 *  - Helmet: HSTS, X-Frame-Options DENY (clickjacking), nosniff, referrer policy,
 *    strict CSP (API serves JSON only, so default-src 'none').
 *  - CORS: explicit allowlist + credentials for cookie-based refresh.
 *  - Signed cookies for the refresh token (HttpOnly, SameSite, Secure in prod).
 */
export const securityPlugin = fp(async (app) => {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow same-origin / curl (no Origin header) and explicit allowlist.
      if (!origin || config.CORS_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error('Origin not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    maxAge: 600,
  });

  await app.register(cookie, {
    secret: config.JWT_REFRESH_SECRET,
    parseOptions: {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.NODE_ENV === 'production',
      path: '/v1/auth',
      domain: config.COOKIE_DOMAIN,
    },
  });
});
