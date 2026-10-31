import express, { Application } from 'express';
import helmet from 'helmet';
import { errorMiddleware } from './frameworks/http/middlewares/errorMiddleware';
import { healthRoutes, ReadinessCheck } from './frameworks/http/routes/healthRoutes';

export function createApp(checkDatabase: ReadinessCheck): Application {
  const app = express();

  // How many proxies sit in front, so req.ip is the caller and not the gateway.
  // Off by default: local and test runs read the real socket address.
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);

  app.use(helmet());
  app.use(express.json());

  app.use('/', healthRoutes(checkDatabase));

  app.use(errorMiddleware);

  return app;
}
