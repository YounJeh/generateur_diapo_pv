import express, { type Request, type Response, type NextFunction } from "express";
import { OUTPUT_DIR } from "./sessions.js";
import { extractRouter } from "./routes/extract.js";
import { generateRouter } from "./routes/generate.js";

export function createApp(): express.Express {
  const app = express();

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", extractRouter);
  app.use("/api", generateRouter);

  // Sert les pptx générés et les images d'aperçu (voir sessionOutputPptxPath/sessionOutputPreviewDir).
  app.use("/files", express.static(OUTPUT_DIR));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  });

  return app;
}
