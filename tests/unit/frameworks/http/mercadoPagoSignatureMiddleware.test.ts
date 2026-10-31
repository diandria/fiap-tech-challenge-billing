import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { mercadoPagoSignatureMiddleware } from '../../../../src/frameworks/http/middlewares/mercadoPagoSignatureMiddleware';
import { errorMiddleware } from '../../../../src/frameworks/http/middlewares/errorMiddleware';

const secret = 'webhook-secret';

function appWithSignatureCheck() {
  const app = express();
  app.post('/notifications', mercadoPagoSignatureMiddleware(secret), (_req, res) => { res.json({ passed: true }); });
  app.use(errorMiddleware);
  return app;
}

describe('mercadoPagoSignatureMiddleware', () => {
  it('lets through a request signed over the data.id of the query string', async () => {
    const ts = '1704908010';
    const v1 = createHmac('sha256', secret).update(`id:123456;request-id:req-1;ts:${ts};`).digest('hex');

    const res = await request(appWithSignatureCheck())
      .post('/notifications?data.id=123456&type=payment')
      .set('x-signature', `ts=${ts},v1=${v1}`)
      .set('x-request-id', 'req-1');

    expect(res.status).toBe(200);
  });

  it('answers 401 for an unsigned request', async () => {
    const res = await request(appWithSignatureCheck()).post('/notifications?data.id=123456&type=payment');

    expect(res.status).toBe(401);
  });
});
