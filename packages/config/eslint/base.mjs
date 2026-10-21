import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const ROLE_NAMES =
  'platform_admin|university_admin|institute_admin|hod|timetable_coordinator|exam_coordinator|faculty|student';

/**
 * Shared rules for every TypeScript package.
 * Role checks must go through can() in @slotwise/shared, so comparing against a
 * role string literal is an error everywhere except packages/shared.
 */
export const noInlineRoleChecks = {
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: `BinaryExpression[operator=/^[!=]==?$/] > Literal[value=/^(${ROLE_NAMES})$/]`,
        message: 'Do not compare role strings inline. Use can(user, action, resource) from @slotwise/shared.',
      },
      {
        selector: `SwitchCase > Literal[value=/^(${ROLE_NAMES})$/]`,
        message: 'Do not switch on role strings inline. Use can(user, action, resource) from @slotwise/shared.',
      },
    ],
  },
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  noInlineRoleChecks,
  prettier,
);
