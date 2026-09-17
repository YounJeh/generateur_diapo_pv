import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/server/app.js";

/**
 * Régression pour une faille de traversée de chemin trouvée en revue :
 * `src/server/routes/extract.ts` construisait le nom de fichier sur disque à
 * partir de `file.fieldname` (nom de champ multipart, fourni par le client),
 * que multer ne sanitize pas avant `path.join` — un champ forgé permettait
 * d'écrire un fichier arbitraire hors de `runtime/uploads/<sessionId>/`.
 * Depuis le passage à Vercel Blob, l'équivalent est un `pathname` de blob
 * forgé (pointant hors de `sessions/<sessionId>/uploads/`, ou vers la
 * session de quelqu'un d'autre) : corrigé par `isUploadPathnameFor` dans
 * `src/server/sessions.ts`, appliqué à la fois par `/api/extract` (lecture)
 * et `/api/blob/upload-token` (écriture).
 */
describe("sécurité : entrées non fiables rejetées avant d'atteindre le stockage Blob", () => {
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

  it("rejette un pathname d'upload qui ne correspond pas à la session (upload-token)", async () => {
    const sessionId = randomUUID();
    const otherSessionId = randomUUID();
    const response = await fetch(`${baseUrl}/api/blob/upload-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: {
          pathname: `sessions/${otherSessionId}/uploads/pdf.pdf`,
          multipart: false,
          clientPayload: sessionId,
        },
      }),
    });

    expect(response.ok).toBe(false);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/non autorisé/);
  });

  it("rejette un pathname de fichier PDF invalide à l'extraction", async () => {
    const sessionId = randomUUID();
    const response = await fetch(`${baseUrl}/api/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        scenario: "sans-stockage",
        rangees: 3,
        pdfPathname: "sessions/../../../etc/passwd",
      }),
    });

    expect(response.ok).toBe(false);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/Fichier PDF manquant ou invalide/);
  });

  it("renvoie 404 (pas une erreur système de fichiers) pour un sessionId au format traversal", async () => {
    const response = await fetch(
      `${baseUrl}/api/generate/${encodeURIComponent("../../../../etc/passwd")}`,
      { method: "POST" },
    );

    expect(response.status).toBe(404);
  });
});
