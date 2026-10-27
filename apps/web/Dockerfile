# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/web/Dockerfile -t slotwise-web .
FROM node:24.19.0-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.34.7
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm turbo run build --filter=@slotwise/web

ENV NODE_ENV=production
WORKDIR /repo/apps/web
USER node
# Railway/Render provide PORT.
CMD ["sh", "-c", "node_modules/.bin/next start -p ${PORT:-3000}"]
