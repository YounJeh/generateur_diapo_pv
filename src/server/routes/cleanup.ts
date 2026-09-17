import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { cleanupExpiredSessionFiles } from "../sessionRetention.js";

export function createCleanupRouter(secret: string | undefined) {
  const router = Router();
  router.get("/api/cron/cleanup", async (req, res, next) => {
    if (!secret) {
      res.status(503).json({ error: "CRON_SECRET manquant." });
      return;
    }
    const actual = createHash("sha256").update(req.get("authorization") ?? "").digest();
    const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
    if (!timingSafeEqual(actual, expected)) {
      res.status(401).json({ error: "Authentification du nettoyage requise." });
      return;
    }
    try {
      res.json({ deleted: await cleanupExpiredSessionFiles() });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
