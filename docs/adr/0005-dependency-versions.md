# ADR 0005: Dependency versions for Phase 0

- Status: accepted
- Date: 2026-10-21

All versions are pinned exactly (`save-exact=true`, `uv.lock`). Where the newest major was
very new or broke a neighbour, we chose the previous, well-documented line:

| Package    | Chosen               | Newest at the time | Why                                                                        |
| ---------- | -------------------- | ------------------ | -------------------------------------------------------------------------- |
| NestJS     | 11.2.7               | 12.2.0             | 12 just became ESM-only; 11 is CommonJS, maintained and widely documented. |
| TypeScript | 6.0.3                | 7.0.2              | typescript-eslint supports `<6.1`.                                         |
| ESLint     | 9.39.5 (maintenance) | 10.13.0            | Plugins inside `eslint-config-next` do not support 10 yet.                 |
| Prisma     | 6.19.3               | 7.10.1 (8.0 rc)    | `@auth/prisma-adapter` supports up to Prisma 6.                            |
| Vitest     | 4.1.12               | 5.0.5              | 5.0 was weeks old.                                                         |
| next-auth  | 5.0.0-beta.32        | 4.24.15 (`latest`) | v5 is the App Router version Auth.js documents.                            |
| Next.js    | 16.4.2               | same               | Note: `middleware.ts` is called `proxy.ts` since 16.                       |
| Node       | 24 LTS               | —                  | Needed for `process.loadEnvFile` and `require()` of ESM-only `jose`.       |
| Python     | 3.12                 | 3.13               | CLAUDE.md; matches OR-Tools wheels.                                        |

Revisit when Dependabot proposes the next majors (`.github/dependabot.yml`).
