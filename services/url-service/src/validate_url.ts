export function validateHttpUrl(s: string): { ok: true; url: URL } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    return { ok: false, error: "long_url must be a valid URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "long_url must be http/https" };
  }

  return { ok: true, url: parsed };
}
