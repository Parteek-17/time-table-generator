import base from '@slotwise/config/eslint/base';

// packages/shared is the one place allowed to reference role names directly.
export default [
  ...base,
  {
    files: ['src/auth/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
