import { createServer, type Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createCleanupRouter } from "../../src/server/routes/cleanup.js";
import { cleanupExpiredSessionFiles } from "../../src/server/sessionRetention.js";

vi.mock("../../src/server/sessionRetention.js", () => ({ cleanupExpiredSessionFiles: vi.fn() }));

describe("route de purge", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const app = express();
    app.use(createCleanupRouter("cron-secret"));
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  beforeEach(() => { vi.resetAllMocks(); });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

  it.each([undefined, "Bearer wrong", "Basic cron-secret"])("refuse le nettoyage sans le secret exact : %s", async (authorization) => {
    const response = await fetch(base + "/api/cron/cleanup", {
      headers: authorization ? { Authorization: authorization } : {},
    });
    expect(response.status).toBe(401);
    expect(cleanupExpiredSessionFiles).not.toHaveBeenCalled();
  });

  it("autorise le Bearer Cron sans cookie utilisateur", async () => {
    vi.mocked(cleanupExpiredSessionFiles).mockResolvedValue(4);
    const response = await fetch(base + "/api/cron/cleanup", { headers: { Authorization: "Bearer cron-secret" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: 4 });
    expect(cleanupExpiredSessionFiles).toHaveBeenCalledOnce();
  });
});
