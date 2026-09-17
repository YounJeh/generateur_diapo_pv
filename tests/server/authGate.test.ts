import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/server/app.js";

const TEST_PASSWORD = "correct-password";

describe("authGate : protection par mot de passe partagé", () => {
  let baseUrl: string;
  let server: Server;

  beforeAll(async () => {
    process.env.APP_PASSWORD = TEST_PASSWORD;
    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("laisse passer /api/health sans authentification", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
  });

  it("bloque une route API sans cookie de session avec 401", async () => {
    const response = await fetch(`${baseUrl}/api/generate/${crypto.randomUUID()}`, {
      method: "POST",
    });
    expect(response.status).toBe(401);
  });

  it("refuse le formulaire de connexion avec un mauvais mot de passe", async () => {
    const response = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "password=mauvais-mot-de-passe",
      redirect: "manual",
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("accepte le bon mot de passe et pose un cookie qui autorise les requêtes suivantes", async () => {
    const loginResponse = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `password=${encodeURIComponent(TEST_PASSWORD)}`,
      redirect: "manual",
    });
    expect(loginResponse.status).toBe(303);
    const setCookie = loginResponse.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();

    const authenticated = await fetch(`${baseUrl}/api/generate/${crypto.randomUUID()}`, {
      method: "POST",
      headers: { Cookie: setCookie!.split(";")[0] },
    });
    // 404 (session introuvable) et non 401 : la requête a bien passé le gate d'auth.
    expect(authenticated.status).toBe(404);
  });

  it("ignore un cookie sans encodage valide au lieu de renvoyer 500", async () => {
    const response = await fetch(`${baseUrl}/api/extract`, {
      method: "POST", headers: { Cookie: "unrelated=%; pv_studio_auth=%" },
    });
    expect(response.status).toBe(401);
  });

  it("préserve un cookie d’authentification valide avec un autre cookie malformé", async () => {
    const login = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `password=${TEST_PASSWORD}`, redirect: "manual",
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const response = await fetch(`${baseUrl}/api/unknown`, {
      headers: { Cookie: `unrelated=%; ${cookie}` },
    });
    expect(response.status).toBe(404);
  });

  it("bloque les essais répétés, y compris un bon mot de passe après la limite", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const response = await fetch(`${baseUrl}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "password=wrong", redirect: "manual",
      });
      statuses.push(response.status);
    }
    expect(statuses).toContain(401);
    expect(statuses.at(-1)).toBe(429);
    const response = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `password=${TEST_PASSWORD}`, redirect: "manual",
    });
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

});
