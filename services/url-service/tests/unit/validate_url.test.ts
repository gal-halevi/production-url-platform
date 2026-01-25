import { describe, expect, test } from "vitest";
import { validateHttpUrl } from "../../src/validate_url.js";

describe("validateHttpUrl", () => {
  test("accepts https", () => {
    const r = validateHttpUrl("https://example.com");
    expect(r.ok).toBe(true);
  });

  test("rejects javascript scheme", () => {
    const r = validateHttpUrl("javascript:alert(1)");
    expect(r.ok).toBe(false);
  });

  test("rejects invalid url", () => {
    const r = validateHttpUrl("not-a-url");
    expect(r.ok).toBe(false);
  });
});
