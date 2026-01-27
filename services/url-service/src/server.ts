import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { loadConfig } from "./config.js";
import type { UrlStore } from "./storage.js";
import { MemoryUrlStore } from "./storage_memory.js";
import { PostgresUrlStore } from "./storage_postgres.js";
import { validateHttpUrl } from "./validate_url.js";
import { getOrCreateRequestId } from "./request_id.js";

const config = loadConfig();

function buildStore(): UrlStore {
  if (config.storageMode === "postgres") {
    return new PostgresUrlStore(config.databaseUrl!);
  }
  return new MemoryUrlStore();
}

const store = buildStore();

const app = Fastify({
  logger: {
    level: config.logLevel
  },
  bodyLimit: config.bodyLimitBytes,
  trustProxy: true,
  genReqId: (req) => {
    // req.headers is IncomingMessage headers type
    return getOrCreateRequestId(req.headers as any);
  }
});

await app.register(helmet, {
  // reasonable defaults; can tune later behind ingress/load balancer
  contentSecurityPolicy: false
});

if (config.rateLimitEnabled) {
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitTimeWindowMs
  });
}

app.addHook("onSend", async (req, reply) => {
  reply.header("X-Request-Id", req.id);
});

app.get("/health", async () => {
  return { status: "ok", service: "url-service" };
});

app.get("/ready", async () => {
  // readiness checks: verify storage is initialized and responsive
  // for memory this is always OK; for postgres we can ping
  if (config.storageMode === "postgres") {
    // simplest check by doing a trivial operation
    // (we can add a dedicated ping method later)
    await store.init();
  }
  return { status: "ready" };
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
          properties: {
          error: { type: "string" }
          }
        },
        500: {
          type: "object",
          properties: {
          error: { type: "string" }
          }
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

app.setErrorHandler((err, _req, reply) => {
  // avoid leaking internal details
  app.log.error({ err }, "request failed");
  return reply.code(500).send({ error: "internal_error" });
});

await store.init();

await app.listen({ port: config.port, host: config.host });
app.log.info({ port: config.port, storageMode: config.storageMode }, "url-service started");
