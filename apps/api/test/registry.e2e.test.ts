/**
 * C0 scaffolding: every stream's placeholder module is registered and its health route
 * follows the stream's feature flag.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { redisConnection } from '../src/queue/queue.service';
import { createTestApp } from './helpers';

let app: INestApplication;

beforeAll(async () => {
  ({ app } = await createTestApp());
});

afterAll(async () => {
  await app?.close();
});

const AREAS = [
  ['timetable', 'P2T'],
  ['reschedule', 'P4'],
  ['portal', 'P5'],
  ['exams', 'P6'],
  ['platform', 'P7'],
] as const;

describe('placeholder health routes', () => {
  afterEach(() => {
    for (const [, flag] of AREAS) delete process.env[`FLAG_${flag}`];
  });

  it.each(AREAS)('/%s/health is 200 with its flag on', async (area, flag) => {
    process.env[`FLAG_${flag}`] = '1';
    const res = await request(app.getHttpServer()).get(`/${area}/health`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', area });
  });

  it.each(AREAS)('/%s/health is 404 with its flag off', async (area, flag) => {
    process.env[`FLAG_${flag}`] = '0';
    const res = await request(app.getHttpServer()).get(`/${area}/health`);
    expect(res.status).toBe(404);
  });

  it('keeps P1 routes registered', async () => {
    // Needs an institute, so 400 without one (not 404): the module is mounted.
    const res = await request(app.getHttpServer()).get('/departments');
    expect(res.status).not.toBe(404);
  });
});

describe('redisConnection', () => {
  it('reads host, port, password and database from REDIS_URL', () => {
    expect(redisConnection('rediss://user:p%40ss@cache.example:6380/3')).toMatchObject({
      host: 'cache.example',
      port: 6380,
      username: 'user',
      password: 'p@ss',
      db: 3,
      tls: {},
      maxRetriesPerRequest: null,
    });
    expect(redisConnection('redis://localhost:6379')).toMatchObject({ port: 6379, db: 0 });
  });
});
