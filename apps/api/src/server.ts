import { env } from './config/env';
import { createApp } from './app';
import { logger } from './utils/logger';

const app = createApp();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'api_listening');
});
