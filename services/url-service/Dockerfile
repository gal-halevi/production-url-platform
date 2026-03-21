# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json tsconfig.instrumentation.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

# Build metadata (populated via --build-arg in CI)
ARG GIT_SHA=unknown
ARG APP_VERSION=unknown

ENV GIT_SHA=$GIT_SHA
ENV APP_VERSION=$APP_VERSION

# Security: create non-root user with explicit UID for consistency with
# Kubernetes securityContext runAsUser. UID 10001 matches analytics-service.
RUN apk upgrade --no-cache && \
    addgroup -S -g 10001 app && adduser -S -u 10001 -G app app
USER app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 3000

# Container healthcheck (works even without curl/wget by using node)
HEALTHCHECK --interval=10s --timeout=2s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# --require loads instrumentation.cjs before any other module in CJS context.
# CJS is required for OTel auto-instrumentation hooks (ignoreIncomingRequestHook)
# to work correctly — they are not reliably invoked under --import/ESM.
CMD ["node", "--require", "./dist/instrumentation.cjs", "dist/server.js"]
