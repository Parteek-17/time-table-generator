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
  await app.listen(env.PORT);
  Logger.log(`API listening on http://localhost:${env.PORT}`, 'Bootstrap');
}

void bootstrap();
