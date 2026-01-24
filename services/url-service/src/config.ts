export type StorageMode = "memory" | "postgres";

export interface Config {
  port: number;
  host: string;
  baseUrl: string;
  storageMode: StorageMode;
  databaseUrl?: string;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  bodyLimitBytes: number;
  rateLimitEnabled: boolean;
  rateLimitMax: number;
  rateLimitTimeWindowMs: number;
}

function mustBeUrl(s: string): string {
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");
    return s;
  } catch {
    throw new Error(`Invalid BASE_URL: ${s}`);
  }
}

export function loadConfig(): Config {
  const port = Number(process.env.PORT ?? "3000");
  if (!Number.isFinite(port) || port <= 0) throw new Error("Invalid PORT");

  const host = process.env.HOST ?? "0.0.0.0";

  const baseUrl = mustBeUrl(process.env.BASE_URL ?? "http://localhost:3000");

  const databaseUrl = process.env.DATABASE_URL;
  const storageMode: StorageMode =
    (process.env.STORAGE_MODE as StorageMode) ?? (databaseUrl ? "postgres" : "memory");

  const logLevel = (process.env.LOG_LEVEL as Config["logLevel"]) ?? "info";

  const bodyLimitBytes = Number(process.env.BODY_LIMIT_BYTES ?? String(1024 * 16)); // 16KB
  const rateLimitEnabled = (process.env.RATE_LIMIT_ENABLED ?? "true") === "true";
  const rateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? "60");
  const rateLimitTimeWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? "60000");

  if (storageMode === "postgres" && !databaseUrl) {
    throw new Error("STORAGE_MODE=postgres requires DATABASE_URL");
  }

  return {
    port,
    host,
    baseUrl,
    storageMode,
    databaseUrl,
    logLevel,
    bodyLimitBytes,
    rateLimitEnabled,
    rateLimitMax,
    rateLimitTimeWindowMs
  };
}