/**
 * P5's calls to other streams' routes, against a stub HTTP server: P6's "my exams" is read as
 * the viewer and never breaks Today (missing route, error, unknown shape → null).
 */
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadDotEnv, loadEnv } from '../config/env';

loadDotEnv();
import { PublishedTimetableClient } from './timetable.client';

let server: Server;
let base = '';
let reply: { status: number; body: unknown } = { status: 200, body: {} };
let seen: { url?: string; headers?: IncomingHttpHeaders } = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    seen = { url: req.url, headers: req.headers };
    res.writeHead(reply.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const client = () =>
  new PublishedTimetableClient(loadEnv({ ...process.env, NODE_ENV: 'test' }), () => base);

const seat = {
  date: '2026-12-01',
  sessionLabel: 'Morning',
  startMinute: 600,
  endMinute: 780,
  paperCode: 'CS303',
  paperTitle: 'Operating Systems',
  hallCode: 'G16',
  building: 'Main block',
  floor: 0,
  seatLabel: 'G16-R3-C2',
  row: 3,
  column: 2,
};

describe("P6's my exams", () => {
  it('reads /exams/me as the viewer for the institute', async () => {
    reply = {
      status: 200,
      body: { shows: 'seats', name: 'A', rollNo: '1', seats: [seat], duties: [] },
    };
    const mine = await client().myExams('demo', '5e000000-0000-4000-8000-000000000001');
    expect(mine?.seats).toHaveLength(1);
    expect(seen.url).toBe('/exams/me');
    expect(seen.headers?.['x-institute-slug']).toBe('demo');
    expect(seen.headers?.authorization).toMatch(/^Bearer /);
  });

  it('gives null when P6 is off, fails, or answers in an unknown shape', async () => {
    for (const r of [
      { status: 404, body: { message: 'Not found' } },
      { status: 500, body: {} },
      { status: 200, body: { seats: [{ date: 'soon' }] } },
    ]) {
      reply = r;
      expect(await client().myExams('demo', '5e000000-0000-4000-8000-000000000001')).toBeNull();
    }
  });
});
