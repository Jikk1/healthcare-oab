import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ok } from '../../shared/http.js';
import { Unauthorized } from '../../shared/errors.js';
import { config } from '../../config/env.js';
import { authService } from './auth.service.js';
import type { SessionMeta } from './token.service.js';
import {
  ConfirmResetBody,
  LoginBody,
  MfaVerifyBody,
  RefreshBody,
  RegisterBody,
  RequestResetBody,
} from './auth.schema.js';

const REFRESH_COOKIE = 'hcoab_rt';

function metaFrom(req: FastifyRequest): SessionMeta {
  return {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
    deviceLabel: typeof req.headers['x-device-label'] === 'string'
      ? req.headers['x-device-label']
      : undefined,
  };
}

function setRefreshCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    signed: true,
    httpOnly: true,
    sameSite: 'strict',
    secure: config.NODE_ENV === 'production',
    path: '/v1/auth',
    domain: config.COOKIE_DOMAIN,
    expires: expiresAt,
  });
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE, { path: '/v1/auth', domain: config.COOKIE_DOMAIN });
}

/**
 * Reads the refresh token from either the signed cookie (browser clients) or the
 * JSON body (native/mobile clients that cannot use cookies).
 */
function readRefresh(req: FastifyRequest, bodyToken?: string): string | undefined {
  const raw = req.cookies[REFRESH_COOKIE];
  if (raw) {
    const unsigned = req.unsignCookie(raw);
    if (unsigned.valid && unsigned.value) return unsigned.value;
  }
  return bodyToken;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const strictLimit = { rateLimit: { max: 10, timeWindow: 60_000 } };

  app.post('/v1/auth/register', { config: strictLimit }, async (req, reply) => {
    const body = RegisterBody.parse(req.body);
    const result = await authService.register(body, metaFrom(req));
    setRefreshCookie(reply, result.tokens.refreshToken, result.tokens.refreshExpiresAt);
    reply.status(201);
    return ok(toAuthResponse(result), { requestId: req.correlationId });
  });

  app.post('/v1/auth/login', { config: strictLimit }, async (req, reply) => {
    const body = LoginBody.parse(req.body);
    const result = await authService.login(body, metaFrom(req));
    setRefreshCookie(reply, result.tokens.refreshToken, result.tokens.refreshExpiresAt);
    return ok(toAuthResponse(result), { requestId: req.correlationId });
  });

  app.post('/v1/auth/refresh', { config: strictLimit }, async (req, reply) => {
    const body = RefreshBody.parse(req.body ?? {});
    const raw = readRefresh(req, body.refreshToken);
    if (!raw) throw Unauthorized('Missing refresh token');
    const tokens = await authService.refresh(raw, metaFrom(req));
    setRefreshCookie(reply, tokens.refreshToken, tokens.refreshExpiresAt);
    return ok(
      {
        accessToken: tokens.accessToken,
        accessExpiresIn: tokens.accessExpiresIn,
        refreshToken: tokens.refreshToken,
        refreshExpiresAt: tokens.refreshExpiresAt,
      },
      { requestId: req.correlationId },
    );
  });

  app.post('/v1/auth/logout', async (req, reply) => {
    const body = RefreshBody.parse(req.body ?? {});
    const raw = readRefresh(req, body.refreshToken);
    await authService.logout(raw);
    clearRefreshCookie(reply);
    reply.status(204);
  });

  // ---- Password reset ----

  app.post('/v1/auth/password/reset-request', { config: strictLimit }, async (req) => {
    const body = RequestResetBody.parse(req.body);
    await authService.requestPasswordReset(body.email);
    // Uniform response — never reveals whether the email exists.
    return ok({ status: 'ok' }, { requestId: req.correlationId });
  });

  app.post('/v1/auth/password/reset-confirm', { config: strictLimit }, async (req) => {
    const body = ConfirmResetBody.parse(req.body);
    await authService.confirmPasswordReset(body.token, body.password);
    return ok({ status: 'ok' }, { requestId: req.correlationId });
  });

  // ---- MFA (authenticated) ----

  app.post('/v1/auth/mfa/setup', { preHandler: app.authenticate }, async (req) => {
    const result = await authService.setupMfa(req.auth!.userId);
    return ok(result, { requestId: req.correlationId });
  });

  app.post('/v1/auth/mfa/confirm', { preHandler: app.authenticate }, async (req) => {
    const body = MfaVerifyBody.parse(req.body);
    const recoveryCodes = await authService.confirmMfa(req.auth!.userId, body.code);
    return ok({ recoveryCodes }, { requestId: req.correlationId });
  });

  app.delete('/v1/auth/mfa', { preHandler: app.authenticate }, async (req, reply) => {
    await authService.disableMfa(req.auth!.userId);
    reply.status(204);
  });
}

function toAuthResponse(result: Awaited<ReturnType<typeof authService.login>>) {
  return {
    user: result.user,
    organization: result.organization,
    role: result.role,
    accessToken: result.tokens.accessToken,
    accessExpiresIn: result.tokens.accessExpiresIn,
    refreshToken: result.tokens.refreshToken,
    refreshExpiresAt: result.tokens.refreshExpiresAt,
  };
}
