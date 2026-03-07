import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';

import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { notFoundMiddleware } from './middleware/not-found';
import { requestContextMiddleware } from './middleware/request-context';
import { authRouter } from './routes/auth';
import { driverRouter } from './routes/driver';
import { healthRouter } from './routes/health';
import { platformRouter } from './routes/platform';
import { tenantedRouter } from './routes/tenanted';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  const corsOptions: cors.CorsOptions = {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (env.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      try {
        const hostname = new URL(origin).hostname.toLowerCase();

        if (hostname.endsWith(`.${env.PLATFORM_BASE_DOMAIN}`)) {
          callback(null, true);
          return;
        }
      } catch {
        callback(null, false);
        return;
      }

      callback(null, false);
    },
    credentials: false,
  };
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(express.json());
  app.use('/storage', express.static(path.resolve(process.cwd(), 'storage')));
  app.use(requestContextMiddleware);

  app.use(healthRouter);
  app.use('/auth', authRouter);
  app.use('/platform', platformRouter);
  app.use('/tenanted', tenantedRouter);
  app.use('/tenanted/driver', driverRouter);

  app.use(notFoundMiddleware);
  app.use(errorHandler);

  return app;
}
