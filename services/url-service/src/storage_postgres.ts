import pg from "pg";
import type { UrlRecord, UrlStore } from "./storage.js";

const { Pool } = pg;

export class PostgresUrlStore implements UrlStore {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      // safe defaults
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000
    });
  }

  async init(): Promise<void> {
    // Minimal schema bootstrap (for learning project).
    // In later milestones, we’ll move this to migrations.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS urls (
        code TEXT PRIMARY KEY,
        long_url TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  async create(longUrl: string): Promise<UrlRecord> {
    // Generate in DB using retry loop: simplest safe approach without sequences.
    // (We can move to a dedicated “code generator” later.)
    for (let i = 0; i < 5; i++) {
      const code = this.randomCode();
      try {
        const res = await this.pool.query(
          `INSERT INTO urls (code, long_url) VALUES ($1, $2)
           RETURNING code, long_url, created_at`,
          [code, longUrl]
        );
        const row = res.rows[0];
        return { code: row.code, longUrl: row.long_url, createdAt: row.created_at.toISOString() };
      } catch (e: any) {
        // 23505 = unique_violation
        if (e?.code === "23505") continue;
        throw e;
      }
    }
    throw new Error("Failed to generate unique code");
  }

  async get(code: string): Promise<UrlRecord | null> {
    const res = await this.pool.query(
      `SELECT code, long_url, created_at FROM urls WHERE code = $1`,
      [code]
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    return { code: row.code, longUrl: row.long_url, createdAt: row.created_at.toISOString() };
  }

  private randomCode(): string {
    const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let out = "";
    for (let i = 0; i < 7; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
  }
}