import { nanoid } from "nanoid";
import type { UrlRecord, UrlStore } from "./storage.js";

export class MemoryUrlStore implements UrlStore {
  private readonly map = new Map<string, UrlRecord>();

  async init(): Promise<void> {
    // nothing
  }

  async create(longUrl: string): Promise<UrlRecord> {
    // 7 chars is readable; collision extremely unlikely, but we still guard
    for (let i = 0; i < 3; i++) {
      const code = nanoid(7);
      if (!this.map.has(code)) {
        const rec: UrlRecord = { code, longUrl, createdAt: new Date().toISOString() };
        this.map.set(code, rec);
        return rec;
      }
    }
    throw new Error("Failed to generate unique code");
  }

  async get(code: string): Promise<UrlRecord | null> {
    return this.map.get(code) ?? null;
  }
}