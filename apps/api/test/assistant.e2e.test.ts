/**
 * "Ask Slotwise" without ANTHROPIC_API_KEY (CI, and any install that leaves it empty): the
 * status says off, chat answers 503 in plain words, and input is still validated.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, Fixtures, signToken } from './helpers';

let app: INestApplication;
const fx = new Fixtures();
let token = '';
let slug = '';

beforeAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  let env;
  ({ app, env } = await createTestApp());
  const a = await fx.institute('assistant');
  slug = a.institute.slug;
  const u = await fx.user('assistant-admin');
  await fx.grant(u.id, 'institute_admin', a.institute.id, { type: 'institute' });
  token = await signToken(env, u.id);
}, 60_000);

afterAll(async () => {
  await app?.close();
  await fx.cleanup();
});

const as = () => {
  const http = request(app.getHttpServer());
  return {
    get: (p: string) =>
      http.get(p).set('x-institute-slug', slug).set('authorization', `Bearer ${token}`),
    post: (p: string, body: object) =>
      http.post(p).set('x-institute-slug', slug).set('authorization', `Bearer ${token}`).send(body),
  };
};

describe('assistant without a key', () => {
  it('reports itself off and refuses chat in plain words', async () => {
    expect((await as().get('/assistant')).body).toEqual({ enabled: false });
    const res = await as().post('/assistant/chat', { messages: [{ role: 'user', content: 'Hi' }] });
    expect(res.status).toBe(503);
    expect(res.body.message).toBe('The assistant is not set up yet.');
  });

  it('validates the conversation before anything else', async () => {
    const res = await as().post('/assistant/chat', { messages: [] });
    expect(res.status).toBe(400);
  });

  it('needs a signed-in member', async () => {
    const res = await request(app.getHttpServer())
      .post('/assistant/chat')
      .set('x-institute-slug', slug)
      .send({ messages: [{ role: 'user', content: 'Hi' }] });
    expect(res.status).toBe(401);
  });
});
