export interface UrlRecord {
  code: string;
  longUrl: string;
  createdAt: string;
}

export interface UrlStore {
  ping(): Promise<void>;
  create(longUrl: string): Promise<UrlRecord>;
  get(code: string): Promise<UrlRecord | null>;
}
