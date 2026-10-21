// Copies every .env.example to .env (never overwrites an existing .env).
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dirs = ['apps/web', 'apps/api', 'packages/db'];
for (const dir of dirs) {
  const example = join(dir, '.env.example');
  const target = join(dir, '.env');
  if (!existsSync(example)) continue;
  if (existsSync(target)) {
    console.log(`kept     ${target} (already exists)`);
  } else {
    copyFileSync(example, target);
    console.log(`created  ${target}`);
  }
}
