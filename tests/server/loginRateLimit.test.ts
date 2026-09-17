import { createServer } from "node:http";
import express, { type Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLoginRateLimiter } from "../../src/server/loginRateLimit.js";
import { createAuthGate } from "../../src/server/authGate.js";

function request(ip = "127.0.0.1", forwarded = "spoofed"): Request {
  return { socket: { remoteAddress: ip }, get: () => forwarded } as unknown as Request;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function localEnvironment() {
  vi.stubEnv("VERCEL", "0");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
}

describe("limitation des connexions", () => {
  it("autorise dix essais, ignore les IP forgées et réouvre après quinze minutes", async () => {
    localEnvironment();
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const consume = createLoginRateLimiter();
    for (let i = 0; i < 10; i++) expect(await consume(request())).toBe(0);
    expect(await consume(request("127.0.0.1", "new-spoofed-ip"))).toBe(900);
    expect(await consume(request("127.0.0.2"))).toBe(0);
    now += 900_000;
    expect(await consume(request())).toBe(0);
  });

  it("partage le compteur entre deux instances sur Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    const counters = new Map<string, number>();
    vi.stubGlobal("fetch", vi.fn(async (_url, options: RequestInit) => {
      const command = JSON.parse(options.body as string);
      expect(command[0]).toBe("EVAL");
      expect(command[2]).toBe(1);
      expect(command[4]).toBe(900);
      expect(command[3]).not.toContain("198.51.100.1");
      const count = (counters.get(command[3]) ?? 0) + 1;
      counters.set(command[3], count);
      return Response.json({ result: [count, 800] });
    }));
    const a = createLoginRateLimiter();
    const b = createLoginRateLimiter();
    for (let i = 0; i < 10; i++) {
      expect(await (i % 2 ? a : b)(request("instance-address", "198.51.100.1"))).toBe(0);
    }
    expect(await b(request("other-instance", "198.51.100.1"))).toBe(800);
    expect(await a(request("instance-address", "198.51.100.2"))).toBe(0);
  });

  it("refuse une configuration Vercel sans compteur partagé", () => {
    localEnvironment();
    vi.stubEnv("VERCEL", "1");
    expect(() => createLoginRateLimiter()).toThrow(/UPSTASH/);
  });

  it.each([
    { error: "redis failure" },
    { result: [1, -1] },
    { result: ["1", 900] },
  ])("refuse les réponses Redis invalides : %j", async (body) => {
    localEnvironment();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
    await expect(createLoginRateLimiter()(request())).rejects.toThrow(/indisponible/);
  });

  it("ne connecte pas l’utilisateur si le compteur est indisponible", async () => {
    localEnvironment();
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(createAuthGate("correct", async () => { throw new Error("Redis offline"); }));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address() as { port: number };
      const response = await fetch(`http://127.0.0.1:${address.port}/login`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "password=correct", redirect: "manual",
      });
      expect(response.status).toBe(503);
      expect(response.headers.get("set-cookie")).toBeNull();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
