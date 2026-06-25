import { pino, type LoggerOptions } from 'pino';
import { config, isProd } from '../config/env.js';

/**
 * Structured JSON logging. In dev we pretty-print; in prod we emit raw JSON
 * for ingestion by Loki/ELK. PHI and secrets are redacted defensively.
 *
 * Exported as options (consumed by Fastify, which builds its own logger of the
 * same shape) and as a standalone instance for use outside the request path.
 */
export const loggerOptions: LoggerOptions = {
  level: config.LOG_LEVEL,
  base: {
    service: config.SERVICE_NAME,
    version: config.SERVICE_VERSION,
    env: config.NODE_ENV,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      '*.password',
      '*.secretEnc',
      'firstNameEnc',
      'lastNameEnc',
      'birthDateEnc',
    ],
    censor: '[redacted]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isProd()
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      },
};

export const logger = pino(loggerOptions);

export type Logger = typeof logger;
