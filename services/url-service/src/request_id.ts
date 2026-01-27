import type { FastifyRequest } from "fastify";
import { randomUUID } from "crypto";

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Get incoming X-Request-Id if present, otherwise generate a new one.
 * Keep it simple: trim, enforce a sane length, and avoid empty values.
 */
export function getOrCreateRequestId(req: FastifyRequest): string {
  const raw = req.headers[REQUEST_ID_HEADER];

  const incoming =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw[0]
        : undefined;

  const trimmed = (incoming ?? "").trim();
  if (trimmed.length > 0 && trimmed.length <= 128) {
    return trimmed;
  }

  return randomUUID();
}
