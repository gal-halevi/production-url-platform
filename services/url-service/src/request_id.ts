import { randomUUID } from "crypto";

export const REQUEST_ID_HEADER = "x-request-id";

export function normalizeRequestId(raw: unknown): string | undefined {
  const incoming =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw[0]
        : undefined;

  const trimmed = (incoming ?? "").trim();
  if (trimmed.length > 0 && trimmed.length <= 128) return trimmed;
  return undefined;
}

export function getOrCreateRequestId(headers: Record<string, unknown>): string {
  const existing = normalizeRequestId(headers[REQUEST_ID_HEADER]);
  return existing ?? randomUUID();
}
