import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { Application } from 'express';
import { createApp } from '../../src/app';
import { databaseReadiness } from '../../src/frameworks/database/readinessProbe';

let container: StartedPostgreSqlContainer | undefined;
export let prisma: PrismaClient;

export async function connectTestDB(): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  process.env.DATABASE_URL = container.getConnectionUri();

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
    stdio: 'pipe',
  });

  prisma = new PrismaClient({ datasources: { db: { url: container.getConnectionUri() } } });
  await prisma.$connect();
}

export async function disconnectTestDB(): Promise<void> {
  await prisma?.$disconnect();
  await container?.stop();
}

export async function clearTestDB(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE outbox_messages, processed_messages');
}

export function createTestApp(): Application {
  return createApp(databaseReadiness(prisma));
}
