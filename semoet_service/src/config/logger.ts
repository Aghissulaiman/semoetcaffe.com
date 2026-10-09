import pino, { type Logger } from 'pino';
import { env, isProduction } from './env.js';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-webhook-signature"]',
  'req.body.password',
  'req.body.newPassword',
  'req.body.currentPassword',
  'req.body.code',
  'req.body.otp',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.password_hash',
  'req.body.code_hash',
  '*.password',
  '*.passwordHash',
  '*.codeHash',
  '*.refreshToken',
  '*.accessToken',
  '*.tokenHash',
  '*.rawProviderData',
];

export const logger: Logger = pino({
  level: isProduction ? env.LOG_LEVEL : 'debug',
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  base: {
    service: env.APP_NAME,
    env: env.NODE_ENV,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:dd-mmm-yyyy HH:MM:ss',
          ignore: 'pid,hostname,service,env,base',
          messageFormat: '{level} {msg}',
        },
      },
});

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}