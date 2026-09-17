import { createHash } from "node:crypto";
import type { Request } from "express";

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 10;

// Increment and expiry must be atomic across serverless instances.
const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('TTL', KEYS[1]) }
`;

export type LoginRateLimiter = (req: Request) => Promise<number>;

/** Returns zero when allowed, otherwise the seconds to wait. */
export function createLoginRateLimiter(): LoginRateLimiter {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const onVercel = process.env.VERCEL === "1";
  if ((url && !token) || (!url && token) || (onVercel && !url)) {
    throw new Error("UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN requis sur Vercel.");
  }
  const localAttempts = new Map<string, { count: number; expiresAt: number }>();

  return async (req) => {
    // Vercel overwrites this header. Outside Vercel, never trust a client header.
    const ip = onVercel
      ? req.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
      : req.socket.remoteAddress ?? "unknown";
    const key = `pv-studio:login:${createHash("sha256").update(ip).digest("hex")}`;
    if (url && token) {
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(["EVAL", CONSUME_SCRIPT, 1, key, WINDOW_SECONDS]),
        signal: AbortSignal.timeout(5000),
      });
      const body: unknown = await response.json();
      const result = typeof body === "object" && body !== null && "result" in body
        ? body.result : undefined;
      if (!response.ok || !Array.isArray(result) || result.length !== 2 ||
          !Number.isInteger(result[0]) || result[0] < 1 ||
          !Number.isInteger(result[1]) || result[1] < 0) {
        throw new Error("Compteur de connexion indisponible.");
      }
      return result[0] > MAX_ATTEMPTS ? Math.max(1, result[1]) : 0;
    }

    const now = Date.now();
    for (const [storedKey, entry] of localAttempts) {
      if (entry.expiresAt <= now) localAttempts.delete(storedKey);
    }
    const entry = localAttempts.get(key) ?? { count: 0, expiresAt: now + WINDOW_SECONDS * 1000 };
    entry.count += 1;
    localAttempts.set(key, entry);
    return entry.count > MAX_ATTEMPTS ? Math.ceil((entry.expiresAt - now) / 1000) : 0;
  };
}
