# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/api/Dockerfile -t slotwise-api .
FROM node:24.19.0-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.34.7
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm turbo run build --filter=@slotwise/api

ENV NODE_ENV=production
WORKDIR /repo/apps/api
USER node
# Railway/Render provide PORT. Run migrations separately: pnpm db:deploy (docs/deployment.md).
CMD ["node", "dist/main.js"]
