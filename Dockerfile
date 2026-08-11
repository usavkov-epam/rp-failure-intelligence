# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN corepack enable

FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# The configuration module is validated while Next.js collects routes. These values
# exist only in this disposable build stage; real credentials are supplied at runtime.
ENV NEXT_OUTPUT_MODE=standalone
ENV AUTH_SECRET=container-image-build-placeholder
ENV AUTH_GITHUB_ID=container-image-build-client
ENV AUTH_GITHUB_SECRET=container-image-build-secret
ENV AUTHORIZATION_MODE=users
ENV AUTH_ALLOWED_USERS=container-image-builder
ENV AWS_DYNAMODB_TABLE=container-image-build-table
ENV DATA_ENCRYPTION_KEY=container-image-build-encryption-key
ENV WEB_PUSH_PUBLIC_KEY=container-image-build-public-key
RUN pnpm build

FROM node:22-bookworm-slim AS runtime-base
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=8080
WORKDIR /app

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/signin',{redirect:'manual'}).then(r=>{if(r.status>=500)process.exit(1)}).catch(()=>process.exit(1))"]

# Keep the comparatively large browser/tooling layer independent from application
# output so normal source changes do not reinstall these packages.
FROM node:22-bookworm-slim AS local-runtime-base
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=8080
ENV APP_MODE=local
ENV LOCAL_DATA_DIR=/data
ENV CYPRESS_CACHE_FOLDER=/data/runner/cache/Cypress
ENV COREPACK_HOME=/data/runner/cache/corepack
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates chromium git unzip libgtk-3-0 libgbm-dev libnotify-dev libnss3 \
      libxss1 libasound2 libxtst6 xauth xvfb \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && mkdir -p /data \
    && chown node:node /data

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/signin',{redirect:'manual'}).then(r=>{if(r.status>=500)process.exit(1)}).catch(()=>process.exit(1))"]

FROM local-runtime-base AS local
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --chown=node:node docker/local-entrypoint.sh /usr/local/bin/local-entrypoint
RUN chmod 755 /usr/local/bin/local-entrypoint
VOLUME ["/data"]
USER node
ENTRYPOINT ["local-entrypoint"]
CMD ["node", "server.js"]

FROM runtime-base AS production
USER node
CMD ["node", "server.js"]
