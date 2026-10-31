import request from 'supertest';
import { connectTestDB, disconnectTestDB, createTestApp } from '../helpers/testSetup';
import { createApp } from '../../src/app';

beforeAll(async () => { await connectTestDB(); });
afterAll(async () => { await disconnectTestDB(); });

describe('Health and readiness', () => {
  it('GIVEN the database is up WHEN GET /ready THEN returns 200 with the database check up', async () => {
    // GIVEN
    const app = createTestApp();

    // WHEN
    const res = await request(app).get('/ready');

    // THEN
    expect(res.status).toBe(200);
    expect(res.body.checks.database).toBe('up');
  });

  it('GIVEN the database does not answer WHEN GET /ready THEN returns 503', async () => {
    // GIVEN
    const app = createApp(async () => { throw new Error('connection refused'); });

    // WHEN
    const res = await request(app).get('/ready');

    // THEN
    expect(res.status).toBe(503);
    expect(res.body.checks.database).toBe('down');
  });

  it('GIVEN the database does not answer WHEN GET /health THEN still returns 200', async () => {
    // GIVEN
    const app = createApp(async () => { throw new Error('connection refused'); });

    // WHEN
    const res = await request(app).get('/health');

    // THEN
    expect(res.status).toBe(200);
  });

  it('GIVEN a running service WHEN GET /metrics THEN exposes metrics labelled with the service name', async () => {
    // GIVEN
    const app = createTestApp();

    // WHEN
    const res = await request(app).get('/metrics');

    // THEN
    expect(res.status).toBe(200);
    expect(res.text).toContain('service_name="billing-service"');
  });
});
