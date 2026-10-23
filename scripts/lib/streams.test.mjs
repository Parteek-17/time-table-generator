import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseEnv, renderEnv, streamConfig, streamEnvFiles, STREAM_DATABASES } from './streams.mjs';

const env = {
  'apps/api/.env': parseEnv(
    [
      'API_PORT=4000',
      'DATABASE_URL="postgresql://app:pw@localhost:5432/slotwise"',
      'TEST_OWNER_DATABASE_URL="postgresql://owner:pw@localhost:5432/slotwise"',
      'REDIS_URL="redis://localhost:6379"',
      '# comment',
    ].join('\n'),
  ),
  'apps/web/.env': parseEnv(
    'DATABASE_URL="postgresql://app:pw@localhost:5432/slotwise?schema=public"',
  ),
  'packages/db/.env': parseEnv(
    'OWNER_DATABASE_URL=postgresql://owner:pw@localhost:5432/slotwise\nAPP_DATABASE_URL=postgresql://app:pw@localhost:5432/slotwise',
  ),
};

describe('streamEnvFiles', () => {
  it('moves P2T to its own ports, databases and Redis index, keeping credentials', () => {
    const files = streamEnvFiles(streamConfig('p2t'), env);
    assert.deepEqual(Object.keys(files).sort(), [
      'apps/api/.env.local',
      'apps/web/.env.local',
      'packages/db/.env.local',
      'services/solver/.env.local',
    ]);
    assert.deepEqual(files['apps/api/.env.local'].values, {
      API_PORT: '4003',
      DATABASE_URL: 'postgresql://app:pw@localhost:5432/slotwise_p2t',
      TEST_OWNER_DATABASE_URL: 'postgresql://owner:pw@localhost:5432/slotwise_p2t',
      REDIS_URL: 'redis://localhost:6379/3',
      SOLVER_URL: 'http://localhost:8003',
      WEB_URL_TEMPLATE: 'http://{slug}.localhost:3003',
    });
    assert.deepEqual(files['apps/web/.env.local'].values, {
      WEB_PORT: '3003',
      API_URL: 'http://localhost:4003',
      DATABASE_URL: 'postgresql://app:pw@localhost:5432/slotwise_p2t?schema=public',
    });
    assert.equal(
      files['packages/db/.env.local'].values.OWNER_DATABASE_URL,
      'postgresql://owner:pw@localhost:5432/slotwise_p2t',
    );
  });

  it('gives P2E only a solver port and UI no solver', () => {
    assert.deepEqual(Object.keys(streamEnvFiles(streamConfig('P2E'), env)), [
      'services/solver/.env.local',
    ]);
    const ui = streamEnvFiles(streamConfig('UI'), env);
    assert.equal(ui['services/solver/.env.local'], undefined);
    assert.equal(ui['apps/api/.env.local'].values.SOLVER_URL, undefined);
  });

  it('renders comments and quoted values', () => {
    assert.equal(renderEnv({ comments: ['hi'], values: { A: '1' } }), '# hi\nA="1"\n');
  });

  it('rejects unknown streams and lists the stream databases', () => {
    assert.throws(() => streamConfig('P3'));
    assert.equal(STREAM_DATABASES.length, 7);
    assert.ok(!STREAM_DATABASES.includes('slotwise'));
  });
});
