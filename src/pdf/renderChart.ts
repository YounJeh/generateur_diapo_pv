import { readFile } from "node:fs/promises";
import {
  createCanvas,
  type Canvas,
  type CanvasRenderingContext2D,
} from "canvas";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFPageProxy } from "pdfjs-dist";
import type { Bounds } from "./chartBounds.js";

const RENDER_SCALE = 3;
const TEXT_COLOR = "#3c3c3c";
const TEXT_FONT_FAMILY = "sans-serif";

/**
 * pdfjs crée aussi ses propres canvas internes pendant le rendu (groupes de
 * transparence, masques). Sans cette factory basée sur node-canvas, la
 * factory par défaut échoue en Node avec "Image or Canvas expected" — elle
 * doit être fournie à `getDocument`, pas à `page.render`.
 */
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }

  reset(
    canvasAndContext: { canvas: Canvas },
    width: number,
    height: number,
  ) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: {
    canvas: Canvas | null;
    context: CanvasRenderingContext2D | null;
  }) {
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

type Matrix = [number, number, number, number, number, number];

/** Combine deux matrices affines PDF [a,b,c,d,e,f] : applique m2 puis m1. */
function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * Dessine le texte de la page sur le canvas déjà rendu par pdfjs.
 *
 * Le renderer canvas de pdfjs ne parvient pas à rastériser correctement les
 * glyphes de la police intégrée à ce PDF en environnement Node (le texte
 * ressort invisible, seuls les tracés vectoriels et les icônes s'affichent
 * correctement) — un problème confirmé indépendant de ce projet, propre au
 * rendu de polices intégrées par pdfjs hors navigateur. On redessine donc le
 * texte nous-mêmes avec une police système, en repositionnant chaque item
 * via sa matrice de transformation (comme le fait le calque de texte HTML
 * de pdfjs), plutôt que de dépendre du rendu de police intégré.
 */
async function drawTextItems(
  context: CanvasRenderingContext2D,
  page: PDFPageProxy,
  viewportTransform: Matrix,
): Promise<void> {
  const content = await page.getTextContent();
  context.fillStyle = TEXT_COLOR;
  context.textBaseline = "alphabetic";

  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim() || !("transform" in item)) {
      continue;
    }
    const t = item.transform as Matrix;
    // Les glyphes PDF sont définis dans un espace y-vers-le-haut ; le canvas
    // est y-vers-le-bas. Sans cette inversion locale, le texte s'affiche à
    // l'envers (vérifié empiriquement).
    const flipped: Matrix = [t[0], -t[1], t[2], -t[3], t[4], t[5]];
    const tx = multiply(viewportTransform, flipped);

    context.save();
    context.resetTransform();
    context.transform(tx[0], tx[1], tx[2], tx[3], tx[4], tx[5]);
    context.font = `1px ${TEXT_FONT_FAMILY}`;
    context.fillText(item.str, 0, 0);
    context.restore();
  }
}

/**
 * Rend une page de PDF en raster haute résolution (graphiques + texte
 * redessiné) puis rogne selon `bounds` (calculées par findChartBounds, en
 * points PDF). Retourne un PNG.
 */
export async function renderChartImage(
  pdfPath: string,
  pageNumber: number,
  bounds: Bounds,
): Promise<Buffer> {
  const data = new Uint8Array(await readFile(pdfPath));
  const doc = await pdfjsLib.getDocument({
    data,
    CanvasFactory: NodeCanvasFactory,
    disableFontFace: true,
  }).promise;
  const page = await doc.getPage(pageNumber);

  const canvasFactory = doc.canvasFactory as NodeCanvasFactory;
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const { canvas, context } = canvasFactory.create(
    viewport.width,
    viewport.height,
  );

  await page.render({ canvasContext: context, viewport }).promise;
  await drawTextItems(context, page, viewport.transform as Matrix);

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
