import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { getOrCreateRequestId } from "../../src/request_id.js";

describe("request id", () => {
  it("getOrCreateRequestId uses incoming header when present", () => {
    const id = getOrCreateRequestId({ "x-request-id": "demo-123" } as any);
    expect(id).toBe("demo-123");
  });

  it("getOrCreateRequestId generates when missing", () => {
    const id = getOrCreateRequestId({} as any);
    expect(id).toBeTruthy();
    expect(String(id).length).toBeGreaterThan(0);
  });

  it("echoes X-Request-Id when provided", async () => {
    const app = Fastify({
      logger: false,
      genReqId: (req) => getOrCreateRequestId(req.headers as any)
    });

    app.addHook("onSend", async (req, reply) => {
      reply.header("X-Request-Id", req.id);
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
    const app = Fastify({
      logger: false,
      genReqId: (req) => getOrCreateRequestId(req.headers as any)
    });

    app.addHook("onSend", async (req, reply) => {
      reply.header("X-Request-Id", req.id);
    });

    app.get("/health", async () => ({ ok: true }));

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(String(res.headers["x-request-id"]).length).toBeGreaterThan(0);
  });
});
