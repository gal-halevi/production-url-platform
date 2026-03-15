import Fastify from "fastify";
import type { FastifyError } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { loadConfig } from "./config.js";
import type { UrlStore } from "./storage.js";
import { MemoryUrlStore } from "./storage_memory.js";
import { PostgresUrlStore } from "./storage_postgres.js";
import { validateHttpUrl } from "./validate_url.js";
import { getOrCreateRequestId } from "./request_id.js";
import { registry } from "./metrics.js";
import { httpRequestsTotal, httpRequestDurationSeconds } from "./metrics.js";
import { context, trace } from "@opentelemetry/api";

const config = loadConfig();

function buildStore(): UrlStore {
  if (config.storageMode === "postgres") {
    return new PostgresUrlStore(config.databaseUrl!);
  }
  return new MemoryUrlStore();
}

const store = buildStore();

const startedAt = new Date().toISOString();
const buildInfo = {
  service: "url-service",
  version: process.env.APP_VERSION ?? "unknown",
  commit: process.env.GIT_SHA ?? "unknown",
  env: process.env.APP_ENV ?? "unknown",
  started_at: startedAt
};

const app = Fastify({
  requestIdLogLabel: "request_id",
  logger: {
    level: config.logLevel,
    timestamp: () => `,"timestamp":"${new Date().toISOString().replace(/(\.\d{3})Z$/, (_, ms) => ms + 'Z')}"`,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: () => ({}),
      log: (obj: Record<string, any>) => {
        const { req: _req, res: _res, responseTime: _rt, service: _svc, ...rest } = obj;
        return { service: "url-service", ...rest };
      },
    },
  },
  // Disable Fastify's built-in request/response logs — we emit a single
  // structured log line per request in the onResponse hook instead.
  // This gives us full control over the log schema (method, path, status, ms
  // all in one line) and ensures probe paths can be dropped by Alloy.
  disableRequestLogging: true,
  bodyLimit: config.bodyLimitBytes,
  trustProxy: true,
  genReqId: (req) => {
    return getOrCreateRequestId(req.headers as any);
  }
});

app.addHook("onRequest", async (req, reply) => {
  reply.header("X-Request-Id", req.id);
  (req as any)._metricsStart = process.hrtime.bigint();
});

app.addHook("onResponse", async (req, reply) => {
  const start = (req as any)._metricsStart;
  if (!start) return;

  const durationNs = Number(process.hrtime.bigint() - start);
  const durationSeconds = durationNs / 1e9;
  const ms = Math.round(durationNs / 1e6);

  // Exclude /metrics from both logging and metric observations.
  if (req.url === "/metrics") return;

  const route =
    typeof (req.routeOptions as any)?.url === "string"
      ? (req.routeOptions as any).url
      : "unknown";

  const labels = {
    method: req.method,
    route,
    status_code: String(reply.statusCode)
  };

  httpRequestsTotal.inc(labels);
  // Attach the active trace ID as an exemplar so Grafana can link a
  // latency spike on the dashboard directly to the corresponding Tempo trace.
  const span = trace.getSpan(context.active());
  const spanCtx = span?.spanContext();
  if (spanCtx && trace.isSpanContextValid(spanCtx)) {
    // exemplarLabels is typed as LabelValues<T> (histogram label names only),
    // but the Prometheus OpenMetrics spec allows arbitrary string labels on exemplars.
    // Cast to any to attach trace_id without fighting the overly strict type.
    (httpRequestDurationSeconds as any).observe(
      { labels, value: durationSeconds, exemplarLabels: { trace_id: spanCtx.traceId } }
    );
  } else {
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  }

  // Single structured log line per request — matches the schema of
  // redirect-service and analytics-service for consistent Loki queries.
  app.log.info({
    method: req.method,
    path: req.url,
    status: reply.statusCode,
    ms,
  }, "request");
});

// CORS — only registered when origins are explicitly configured.
if (config.corsOrigins.length > 0) {
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Request-Id"],
    maxAge: 86400,
  });
  app.log.info({ origins: config.corsOrigins }, "CORS enabled");
}

await app.register(helmet, {
  contentSecurityPolicy: false
});

await app.register(rateLimit, {
  max: config.rateLimitEnabled ? config.rateLimitMax : Infinity,
  timeWindow: config.rateLimitTimeWindowMs,
  allowList: (req) => req.url === "/health" || req.url === "/metrics"
});

app.get("/health", async () => {
  return { status: "ok", ...buildInfo };
});

app.get(
  "/ready",
  {
    config: {
      rateLimit: {
        max: config.readyRateLimitMax,
        timeWindow: config.readyRateLimitWindowMs
      }
    }
  },
  async () => {
  if (config.storageMode === "postgres") {
    await store.ping();
  }
  return { status: "ready" };
  }
);

app.get("/metrics", async (_req, reply) => {
  try {
    const metrics = await registry.metrics();
    reply.header("Content-Type", registry.contentType).code(200).send(metrics);
  } catch (err) {
    app.log.error({ err }, "metrics failed");
    reply.code(500).send("metrics_error");
  }
});

app.post(
  "/urls",
  {
    schema: {
      body: {
        type: "object",
        required: ["long_url"],
        properties: {
          long_url: { type: "string", minLength: 1, maxLength: 2048 }
        }
      },
      response: {
        201: {
          type: "object",
          properties: {
            code: { type: "string" },
            short_url: { type: "string" },
            long_url: { type: "string" }
          }
        },
        400: {
          type: "object",
          properties: { error: { type: "string" } }
        },
        500: {
          type: "object",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (req, reply) => {
    const body = req.body as { long_url: string };
    const longUrl = body.long_url;

    const res = validateHttpUrl(longUrl);
    if (!res.ok) {
      return reply.code(400).send({ error: res.error });
    }

    const rec = await store.create(longUrl);
    const shortUrl = `${config.baseUrl.replace(/\/+$/, "")}/r/${rec.code}`;

    return reply.code(201).send({
      code: rec.code,
      short_url: shortUrl,
      long_url: rec.longUrl
    });
  }
);

app.get(
  "/urls/:code",
  {
    schema: {
      params: {
        type: "object",
        required: ["code"],
        properties: { code: { type: "string", minLength: 1, maxLength: 64 } }
      },
      response: {
        200: {
          type: "object",
          properties: {
            code: { type: "string" },
            long_url: { type: "string" }
          }
        },
        404: {
          type: "object",
          properties: { error: { type: "string" } }
        }
      }
    }
  },
  async (req, reply) => {
    const { code } = req.params as { code: string };
    const rec = await store.get(code);
    if (!rec) return reply.code(404).send({ error: "not_found" });

    return reply.send({
      code: rec.code,
      long_url: rec.longUrl
    });
  }
);

app.setErrorHandler((err: FastifyError, _req, reply) => {
  app.log.error({ err }, "request failed");

  const statusCode = err.statusCode ?? 500;

  return reply.code(statusCode).send({
    error: statusCode === 429 ? "rate_limited" : "internal_error"
  });
});

await app.listen({ port: config.port, host: config.host });
app.log.info(
  { port: config.port, storageMode: config.storageMode, ...buildInfo },
  "url-service started"
);
