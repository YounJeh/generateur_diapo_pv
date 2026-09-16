import { Router } from "express";
import path from "node:path";
import { buildComparaisonPptx } from "../../generate/comparaison.js";
import { extractSansStockage, extractStockage } from "../../generate/extract.js";
import { renderSansStockage, renderStockage } from "../../generate/render.js";
import type { Groupe } from "../../generate/types.js";
import { convertPptxToPngs } from "../../preview/pptxToImages.js";
import { writePptx } from "../../pptx/zip.js";
import {
  ensureOutputDir,
  readSessionManifest,
  sessionOutputPptxPath,
  sessionOutputPreviewDir,
  sessionUploadDir,
} from "../sessions.js";

export const generateRouter = Router();

generateRouter.post("/generate/:sessionId", async (req, res, next) => {
  const { sessionId } = req.params;

  try {
    const manifest = await readSessionManifest(sessionId);
    if (!manifest) {
      res.status(404).json({
        error: "Session introuvable ou expirée. Relancez la vérification des données.",
      });
      return;
    }

    await ensureOutputDir();
    const uploadDir = sessionUploadDir(sessionId);
    const pptxPath = sessionOutputPptxPath(sessionId);

    if (manifest.scenario === "comparaison") {
      const groupes: Groupe[] = manifest.groupes.map((g) => ({
        rangees: g.rangees,
        pdfSansStockage: g.pdfSansStockageFilename
          ? path.join(uploadDir, g.pdfSansStockageFilename)
          : undefined,
        pdfAvecStockage: g.pdfAvecStockageFilename
          ? path.join(uploadDir, g.pdfAvecStockageFilename)
          : undefined,
      }));
      const result = await buildComparaisonPptx(groupes);
      writePptx(result.zip, pptxPath);
    } else {
      const pdfPath = path.join(uploadDir, manifest.pdfFilename);
      const zip =
        manifest.scenario === "sans-stockage"
          ? renderSansStockage(await extractSansStockage(pdfPath, manifest.rangees)).zip
          : (await renderStockage(pdfPath, await extractStockage(pdfPath, manifest.rangees))).zip;
      writePptx(zip, pptxPath);
    }

    const pptxUrl = `/files/${sessionId}.pptx`;

    // L'aperçu est un bonus, pas un prérequis : si LibreOffice échoue
    // (absent, mal configuré...), le pptx reste téléchargeable.
    let previewImageUrls: string[] = [];
    try {
      const previewDir = sessionOutputPreviewDir(sessionId);
      const pngPaths = await convertPptxToPngs(pptxPath, previewDir);
      previewImageUrls = pngPaths.map(
        (pngPath) => `/files/${sessionId}-preview/${path.basename(pngPath)}`,
      );
    } catch (error) {
      console.warn(
        `Aperçu indisponible pour la session ${sessionId} : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    res.json({ pptxUrl, previewImageUrls });
  } catch (error) {
    next(error);
  }
});
