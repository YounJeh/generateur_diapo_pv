import express, { type Request, type Response, type NextFunction } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { OUTPUT_DIR } from "./sessions.js";
import { extractRouter } from "./routes/extract.js";
import { generateRouter } from "./routes/generate.js";

// Frontend buildé (`npm run build` à la racine) : servi tel quel pour un
// usage local à un seul port (`npm start`), sans passer par le dev server
// Vite. En développement (`npm run dev`), ce dossier n'existe pas et Vite
// sert le frontend séparément (proxy /api vers ce serveur) — voir
// web/vite.config.ts.
const WEB_DIST_DIR = path.join(process.cwd(), "web", "dist");

export function createApp(): express.Express {
  const app = express();

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", extractRouter);
  app.use("/api", generateRouter);

  // Sert les pptx générés et les images d'aperçu (voir sessionOutputPptxPath/sessionOutputPreviewDir).
  app.use("/files", express.static(OUTPUT_DIR));

  app.use(express.static(WEB_DIST_DIR));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/files")) {
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
