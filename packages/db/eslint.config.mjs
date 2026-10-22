import base from '@slotwise/config/eslint/base';

export default [
  ...base,
  {
    // The seed creates the sample role assignments, so it names roles directly.
    files: ['prisma/seed.ts', 'prisma/seed/**/*.ts', 'test/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
