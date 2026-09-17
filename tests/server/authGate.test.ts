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
});
