import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadDotEnv, loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  loadDotEnv();
  const env = loadEnv();
  const app = await NestFactory.create(AppModule.forRoot(env));
  // The API is called server-to-server by the web app only, so CORS stays off.
  app.enableShutdownHooks();
  const port = env.API_PORT ?? env.PORT;
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
