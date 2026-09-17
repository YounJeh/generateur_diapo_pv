import express, { type Request, type Response, type NextFunction } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthGate } from "./authGate.js";
import { blobUploadTokenRouter } from "./routes/blobUploadToken.js";
import { extractRouter } from "./routes/extract.js";
import { generateRouter } from "./routes/generate.js";

// Frontend buildé (`npm run build` à la racine) : servi tel quel pour un
// usage local à un seul port (`npm start`), sans passer par le dev server
// Vite. En développement (`npm run dev`), ce dossier n'existe pas et Vite
// sert le frontend séparément (proxy /api vers ce serveur) — voir
// web/vite.config.ts.
//
// Résolu par rapport à ce module, pas à `process.cwd()` : sur Vercel, le
// répertoire de travail courant d'une fonction serverless ne correspond pas
// forcément à la racine du bundle (même classe de bug que TEMPLATE_PPTX,
// voir generate/types.ts).
const WEB_DIST_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "dist");

export function createApp(): express.Express {
  const app = express();

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(express.urlencoded({ extended: false }));
  app.use(createAuthGate(process.env.APP_PASSWORD ?? ""));

  app.use("/api", express.json({ limit: "1mb" }));
  app.use("/api", blobUploadTokenRouter);
  app.use("/api", extractRouter);
  app.use("/api", generateRouter);

  // Les PDF sources, le pptx généré et les images d'aperçu vivent tous dans
  // Vercel Blob (voir sessions.ts) : le client y accède via des URLs signées
  // à durée de vie limitée, jamais via une route statique de ce serveur.

  app.use(express.static(WEB_DIST_DIR));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }
    const indexPath = path.join(WEB_DIST_DIR, "index.html");
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  });

  return app;
}
