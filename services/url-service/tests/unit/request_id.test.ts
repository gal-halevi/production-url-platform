import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "../../src/request_id.js";

describe("request id", () => {
  it("getOrCreateRequestId uses incoming header when present", () => {
    const req = { headers: { [REQUEST_ID_HEADER]: "demo-123" } } as any;
    expect(getOrCreateRequestId(req)).toBe("demo-123");
  });

  it("getOrCreateRequestId generates when missing", () => {
    const req = { headers: {} } as any;
    const id = getOrCreateRequestId(req);
    expect(id).toBeTruthy();
    expect(String(id).length).toBeGreaterThan(0);
  });

  it("echoes X-Request-Id when provided", async () => {
    const app = Fastify({ logger: false });

    app.addHook("onRequest", async (req, reply) => {
      const requestId = getOrCreateRequestId(req as any);
      reply.header("X-Request-Id", requestId);
    });

    app.get("/health", async () => ({ ok: true }));

    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "demo-123" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBe("demo-123");
  });

  it("generates X-Request-Id when missing", async () => {
    const app = Fastify({ logger: false });

    app.addHook("onRequest", async (req, reply) => {
      const requestId = getOrCreateRequestId(req as any);
      reply.header("X-Request-Id", requestId);
    });

    app.get("/health", async () => ({ ok: true }));

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(String(res.headers["x-request-id"]).length).toBeGreaterThan(0);
  });
});
