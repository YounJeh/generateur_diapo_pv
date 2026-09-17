import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import express from "express";
import { expect, it } from "vitest";
import { createAuthGate } from "../../src/server/authGate.js";

it("connecte le navigateur à travers les proxies configurés dans Vite", async () => {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(createAuthGate("dev-password", async () => 0));
  app.get("/api/protected", (_req, res) => res.json({ authenticated: true }));
  const backend = createServer(app);
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const target = `http://127.0.0.1:${(backend.address() as { port: number }).port}`;
  try {
    // Use Vite's own Node runtime, avoiding the test runner's older Vite version.
    const script = `
      import { createServer, loadConfigFromFile } from './web/node_modules/vite/dist/node/index.js';
      const { config } = await loadConfigFromFile({ command: 'serve', mode: 'development' }, 'web/vite.config.ts');
      const proxy = Object.fromEntries(Object.keys(config.server.proxy).map(key => [key, process.argv[1]]));
      const vite = await createServer({ ...config, configFile: false, root: 'web', server: { port: 0, proxy } });
      try {
        await vite.listen();
        const base = 'http://localhost:' + vite.httpServer.address().port;
        const login = await fetch(base + '/login', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'password=dev-password', redirect: 'manual',
        });
        const cookie = login.headers.get('set-cookie');
        const protectedResponse = await fetch(base + '/api/protected', { headers: { Cookie: cookie?.split(';')[0] ?? '' } });
        console.log(JSON.stringify({ loginStatus: login.status, redirect: login.headers.get('location'),
          hasCookie: Boolean(cookie), apiStatus: protectedResponse.status, body: await protectedResponse.json() }));
      } finally { await vite.close(); }
    `;
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script, target]);
    expect(JSON.parse(stdout.trim().split("\n").at(-1)!)).toEqual({
      loginStatus: 303, redirect: "/", hasCookie: true, apiStatus: 200, body: { authenticated: true },
    });
  } finally {
    await new Promise<void>((resolve) => backend.close(() => resolve()));
  }
}, 15_000);
