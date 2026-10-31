import 'dotenv/config';
import { createApp } from './app';
import { prisma, disconnectPrisma } from './frameworks/database/prismaClient';
import { databaseReadiness } from './frameworks/database/readinessProbe';
import { logger } from './frameworks/logging/logger';

const PORT = process.env.PORT ?? 3000;

async function main(): Promise<void> {
  const app = createApp(databaseReadiness(prisma));

  // The HTTP server starts before the database connects, so the probes answer during startup.
  const server = app.listen(PORT, () => { logger.info({ port: PORT }, 'server started'); });
  process.on('SIGTERM', () => {
    server.close(async () => { await disconnectPrisma(); process.exit(0); });
    setTimeout(() => process.exit(1), 25_000).unref();
  });

  await prisma.$connect();
}

main().catch((err) => { logger.error({ err }, 'fatal error during startup'); process.exit(1); });
