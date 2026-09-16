import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/server/app.js";

/**
 * Régression pour une faille de traversée de chemin trouvée en revue :
 * `src/server/routes/extract.ts` construisait le nom de fichier sur disque à
 * partir de `file.fieldname` (nom de champ multipart, fourni par le client),
 * que multer ne sanitize pas avant `path.join` — un champ forgé permettait
 * d'écrire un fichier arbitraire hors de `runtime/uploads/<sessionId>/`
 * (vérifié manuellement en écrivant dans /tmp pendant la revue). Corrigé par
 * un allowlist strict sur `file.fieldname` (`fileFilter`) et par la
 * validation du format de `sessionId` dans `src/server/sessions.ts`.
 */
describe("sécurité : entrées non fiables rejetées avant d'atteindre le système de fichiers", () => {
  let baseUrl: string;
  let server: Server;

  beforeAll(async () => {
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

  it("rejette un champ de fichier dont le nom contient une traversée de chemin", async () => {
    const form = new FormData();
    form.set("scenario", "sans-stockage");
    form.set("rangees", "3");
    form.set(
      "../../../../../../tmp/should-not-be-written",
      new Blob([Buffer.from("canary")]),
      "x.pdf",
    );

    const response = await fetch(`${baseUrl}/api/extract`, { method: "POST", body: form });

    expect(response.ok).toBe(false);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/Champ de fichier inattendu/);
  });

  it("renvoie 404 (pas une erreur système de fichiers) pour un sessionId au format traversal", async () => {
    const response = await fetch(
      `${baseUrl}/api/generate/${encodeURIComponent("../../../../etc/passwd")}`,
      { method: "POST" },
    );

    expect(response.status).toBe(404);
  });
});
