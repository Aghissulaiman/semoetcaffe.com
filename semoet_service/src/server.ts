import { createServer } from 'http';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { checkDatabaseConnection, closeDatabase } from './config/database.js';

let server: ReturnType<typeof createServer> | null = null;

async function bootstrap(): Promise<void> {
  await checkDatabaseConnection();

  server = createServer(app);

  server.listen(env.PORT, env.HOST, () => {
    logger.info(
      {
        port: env.PORT,
        host: env.HOST,
        apiPrefix: env.API_PREFIX,
        nodeEnv: env.NODE_ENV,
      },
      '[server] service listening',
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, '[server] shutting down');
    if (server) {
      server.close(() => {
        logger.info('[server] http server closed');
      });
    }

    await closeDatabase();
    logger.info('[server] database closed');
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

bootstrap().catch((error) => {
  logger.fatal({ err: error }, '[server] failed to bootstrap');
  process.exit(1);
});