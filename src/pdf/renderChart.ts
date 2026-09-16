import { readFile } from "node:fs/promises";
import { createCanvas } from "canvas";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFPageProxy } from "pdfjs-dist";
import { ensureChartFontsRegistered } from "../chart/fonts.js";
import {
  NodeCanvasFactory,
  captureGlyphPaints,
  drawTextItems,
  tolerateBrokenPatternTransform,
  type Matrix,
} from "./nodeCanvasText.js";
import type { Bounds } from "./monthlyEnergyChartBounds.js";

export { findItemColor } from "./nodeCanvasText.js";
export type { GlyphPaint } from "./nodeCanvasText.js";

const RENDER_SCALE = 3;

/**
 * Rend une page de PDF en raster haute résolution (graphiques + texte
 * redessiné) puis rogne selon `bounds` (calculées par
 * findMonthlyEnergyChartBounds, en points PDF). Retourne un PNG.
 */
export async function renderChartImage(
  pdfPath: string,
  pageNumber: number,
  bounds: Bounds,
): Promise<Buffer> {
  ensureChartFontsRegistered();
  const data = new Uint8Array(await readFile(pdfPath));
  const doc = await pdfjsLib.getDocument({
    data,
    CanvasFactory: NodeCanvasFactory,
    disableFontFace: true,
  }).promise;
  const page: PDFPageProxy = await doc.getPage(pageNumber);

  const canvasFactory = doc.canvasFactory as NodeCanvasFactory;
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const { canvas, context } = canvasFactory.create(
    viewport.width,
    viewport.height,
  );

  const glyphPaints = captureGlyphPaints(context);
  tolerateBrokenPatternTransform(context);
  await page.render({ canvasContext: context, viewport }).promise;
  await drawTextItems(context, page, viewport.transform as Matrix, glyphPaints);

  const pageHeightPt = page.getViewport({ scale: 1 }).height;
  const cropXLeft = Math.round(bounds.x0 * RENDER_SCALE);
  const cropXRight = Math.round(bounds.x1 * RENDER_SCALE);
  const cropYTop = Math.round((pageHeightPt - bounds.y1) * RENDER_SCALE);
  const cropYBottom = Math.round((pageHeightPt - bounds.y0) * RENDER_SCALE);
  const cropWidth = cropXRight - cropXLeft;
  const cropHeight = cropYBottom - cropYTop;

  const cropCanvas = createCanvas(cropWidth, cropHeight);
  const cropContext = cropCanvas.getContext("2d");
  cropContext.drawImage(
    canvas,
    cropXLeft,
    cropYTop,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  return cropCanvas.toBuffer("image/png");
}
