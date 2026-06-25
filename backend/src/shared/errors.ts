/**
 * Typed application errors. Each carries an HTTP status, a stable machine
 * code (for client branching) and an optional details payload. The global
 * error handler (plugins/error-handler.ts) is the only place that maps these
 * to wire responses, so business code just throws.
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYMENT_REQUIRED'
  | 'PLAN_LIMIT_REACHED'
  | 'MFA_REQUIRED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    options: { details?: unknown; expose?: boolean } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    this.expose = options.expose ?? statusCode < 500;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export const ValidationError = (message = 'Validation failed', details?: unknown): AppError =>
  new AppError(422, 'VALIDATION_ERROR', message, { details });

export const Unauthorized = (message = 'Authentication required'): AppError =>
  new AppError(401, 'UNAUTHORIZED', message);

export const Forbidden = (message = 'Insufficient permissions'): AppError =>
  new AppError(403, 'FORBIDDEN', message);

export const NotFound = (message = 'Resource not found'): AppError =>
  new AppError(404, 'NOT_FOUND', message);

export const Conflict = (message = 'Resource conflict'): AppError =>
  new AppError(409, 'CONFLICT', message);

export const MfaRequired = (message = 'MFA verification required'): AppError =>
  new AppError(401, 'MFA_REQUIRED', message);

export const PlanLimitReached = (message = 'Subscription plan limit reached'): AppError =>
  new AppError(402, 'PLAN_LIMIT_REACHED', message);

export const Internal = (message = 'Internal server error'): AppError =>
  new AppError(500, 'INTERNAL', message, { expose: false });
