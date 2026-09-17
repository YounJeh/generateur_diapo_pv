import { Router } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { buildComparaisonPptx } from "../../generate/comparaison.js";
import { extractSansStockage, extractStockage } from "../../generate/extract.js";
import { renderSansStockageStandalone, renderStockageStandalone } from "../../generate/render.js";
import type { Groupe } from "../../generate/types.js";
import type { Pptx } from "../../pptx/zip.js";
import { convertPptxToPngs } from "../../preview/pptxToImages.js";
import { writePptx } from "../../pptx/zip.js";
import {
  createScratchDir,
  downloadPathnameToScratch,
  outputPptxDownloadPathname,
  presignDownloadUrl,
  readSessionManifest,
  removeScratchDir,
  type SessionManifest,
  uploadOutputPptx,
} from "../sessions.js";

export const generateRouter = Router();

generateRouter.post("/generate/:sessionId", async (req, res, next) => {
  const { sessionId } = req.params;
  let scratchDir: string | undefined;

  try {
    const manifest = await readSessionManifest(sessionId);
    if (!manifest) {
      res.status(404).json({
        error: "Session introuvable ou expirée. Relancez la vérification des données.",
      });
      return;
    }

    scratchDir = await createScratchDir();
    const zip = await buildZip(manifest, scratchDir);

    // `AdmZip.toBufferPromise()` échoue sur ce pptx (bug constaté empiriquement :
    // "Invalid LOC header"), contrairement à `writeZip` (utilisé partout ailleurs
    // dans le projet) : on matérialise donc toujours le pptx sur disque avant de
    // relire ses octets, plutôt que de produire le buffer directement en mémoire.
    const localPptxPath = path.join(scratchDir, "output.pptx");
    writePptx(zip, localPptxPath);
    const pptxBuffer = await readFile(localPptxPath);

    await uploadOutputPptx(sessionId, pptxBuffer);
    const pptxUrl = await presignDownloadUrl(outputPptxDownloadPathname(sessionId));

    // L'aperçu est un bonus, pas un prérequis : si LibreOffice échoue
    // (absent, comme c'est le cas sur Vercel — mal configuré...), le pptx
    // reste téléchargeable.
    let previewImageUrls: string[] = [];
    try {
      previewImageUrls = await buildPreviewImageUrls(localPptxPath, scratchDir, sessionId);
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
  } finally {
    if (scratchDir) {
      await removeScratchDir(scratchDir);
    }
  }
});

async function buildZip(manifest: SessionManifest, scratchDir: string): Promise<Pptx> {
  if (manifest.scenario === "comparaison") {
    const groupes: Groupe[] = await Promise.all(
      manifest.groupes.map(async (g, index): Promise<Groupe> => {
        const n = index + 1;
        return {
          rangees: g.rangees,
          pdfSansStockage: g.pdfSansStockagePathname
            ? await downloadPathnameToScratch(
                g.pdfSansStockagePathname,
                scratchDir,
                `groupe-${n}-sans-stockage.pdf`,
              )
            : undefined,
          pdfAvecStockage: g.pdfAvecStockagePathname
            ? await downloadPathnameToScratch(
                g.pdfAvecStockagePathname,
                scratchDir,
                `groupe-${n}-avec-stockage.pdf`,
              )
            : undefined,
        };
      }),
    );
    return (await buildComparaisonPptx(groupes)).zip;
  }

  const pdfPath = await downloadPathnameToScratch(manifest.pdfPathname, scratchDir, "pdf.pdf");
  if (manifest.scenario === "sans-stockage") {
    return renderSansStockageStandalone(await extractSansStockage(pdfPath, manifest.rangees)).zip;
  }
  return (
    await renderStockageStandalone(pdfPath, await extractStockage(pdfPath, manifest.rangees))
  ).zip;
}

async function buildPreviewImageUrls(
  localPptxPath: string,
  scratchDir: string,
  sessionId: string,
): Promise<string[]> {
  const previewDir = path.join(scratchDir, "preview");
  const pngPaths = await convertPptxToPngs(localPptxPath, previewDir);

  return Promise.all(
    pngPaths.map(async (pngPath, index) => {
      const pathname = `sessions/${sessionId}/preview/${index}.png`;
      await put(pathname, await readFile(pngPath), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "image/png",
      });
      return presignDownloadUrl(pathname);
    }),
  );
}
