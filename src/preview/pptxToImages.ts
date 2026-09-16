import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { ensureChartFontsRegistered } from "../chart/fonts.js";
import {
  NodeCanvasFactory,
  captureGlyphPaints,
  drawTextItems,
  tolerateBrokenPatternTransform,
  type Matrix,
} from "../pdf/nodeCanvasText.js";

const execFileAsync = promisify(execFile);

// Résolution modeste : ceci alimente un aperçu écran, pas un export
// imprimable — inutile de payer le coût mémoire/temps d'une échelle plus
// élevée (ex. RENDER_SCALE=3 utilisé pour le recadrage haute précision du
// graphique mensuel dans renderChart.ts).
const RENDER_SCALE = 2;

async function convertPptxToPdf(pptxPath: string, outDir: string): Promise<string> {
  await execFileAsync("soffice", [
    "--headless",
    "--convert-to",
    "pdf",
    "--outdir",
    outDir,
    pptxPath,
  ]);
  const base = path.basename(pptxPath, path.extname(pptxPath));
  return path.join(outDir, `${base}.pdf`);
}

/**
 * Convertit un pptx en une image PNG par slide, dans l'ordre.
 *
 * Passe par un export pptx→pdf via LibreOffice headless (un seul appel par
 * conversion, ~2-4s ; pas de process "écouteur" persistant — voir
 * tasks/plan.md pour le design retenu après test empirique : la
 * réutilisation d'un process soffice déjà démarré ne réduit pas la latence
 * de façon fiable via l'invocation CLI `--convert-to`), puis rastérise
 * chaque page du pdf obtenu en Node via pdfjs-dist/canvas, en réutilisant le
 * contournement de rendu de texte de `nodeCanvasText.ts` : sans lui, le
 * texte du pdf exporté par LibreOffice ressort invisible sous Node (même
 * bug que pour les PDF SolarEdge rendus dans `renderChart.ts`).
 */
export async function convertPptxToPngs(pptxPath: string, outDir: string): Promise<string[]> {
  ensureChartFontsRegistered();
  await mkdir(outDir, { recursive: true });

  const scratchDir = await mkdtemp(path.join(tmpdir(), "pv-preview-"));
  try {
    const pdfPath = await convertPptxToPdf(pptxPath, scratchDir);
    const data = new Uint8Array(await readFile(pdfPath));
    const doc = await pdfjsLib.getDocument({
      data,
      CanvasFactory: NodeCanvasFactory,
      disableFontFace: true,
    }).promise;
    const canvasFactory = doc.canvasFactory as NodeCanvasFactory;

    const pngPaths: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);

      const glyphPaints = captureGlyphPaints(context);
      tolerateBrokenPatternTransform(context);
      await page.render({ canvasContext: context, viewport }).promise;
      await drawTextItems(context, page, viewport.transform as Matrix, glyphPaints);

      const pngPath = path.join(outDir, `slide-${pageNumber}.png`);
      await writeFile(pngPath, canvas.toBuffer("image/png"));
      pngPaths.push(pngPath);
    }

    return pngPaths;
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}
