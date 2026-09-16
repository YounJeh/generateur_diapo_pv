import { createCanvas, DOMMatrix, type Canvas, type CanvasRenderingContext2D } from "canvas";
import type { PDFPageProxy } from "pdfjs-dist";
import { CHART_FONT_FAMILY } from "../chart/fonts.js";

// Node n'a pas de DOMMatrix global ; pdfjs en a besoin pour peindre les
// motifs à hachures (ex. le losange "Perte d'écrêtage" de la légende) via
// TilingPattern.setTransform, sans quoi le rendu échoue avec "Expected
// DOMMatrix". Le polyfill vient de node-canvas, déjà en dépendance. `lib`
// du tsconfig n'inclut pas "DOM", d'où le cast (globalThis n'a pas ce champ
// typé).
const globalWithDOMMatrix = globalThis as { DOMMatrix?: typeof DOMMatrix };
globalWithDOMMatrix.DOMMatrix ??= DOMMatrix;

/**
 * pdfjs crée aussi ses propres canvas internes pendant le rendu (groupes de
 * transparence, masques). Sans cette factory basée sur node-canvas, la
 * factory par défaut échoue en Node avec "Image or Canvas expected" — elle
 * doit être fournie à `getDocument`, pas à `page.render`.
 */
export class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }

  reset(canvasAndContext: { canvas: Canvas }, width: number, height: number) {
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

export type Matrix = [number, number, number, number, number, number];

/** Combine deux matrices affines PDF [a,b,c,d,e,f] : applique m2 puis m1. */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

export interface GlyphPaint {
  x: number;
  y: number;
  color: string;
}

const TEXT_COLOR_FALLBACK = "#3c3c3c";
// Tolérance (en pixels device, à l'échelle de rendu) pour rattacher un
// glyphe peint par pdfjs à l'item de texte correspondant — voir
// captureGlyphPaints.
const GLYPH_MATCH_Y_TOLERANCE = 5;
const GLYPH_MATCH_X_PADDING = 5;

/**
 * Intercepte les appels `context.fill()` que pdfjs fait pour peindre chaque
 * glyphe (chemin vectoriel issu de la police intégrée, cf. `disableFontFace`
 * ci-dessous) et enregistre la couleur de remplissage réellement résolue par
 * pdfjs (`context.fillStyle`, déjà positionnée par le `setFillRGBColor` du
 * PDF) ainsi que la position de chaque glyphe en pixels canvas. On s'en sert
 * ensuite pour colorer notre propre texte de substitution avec la couleur
 * exacte du PDF plutôt qu'une couleur fixe (voir `drawTextItems`).
 */
export function captureGlyphPaints(context: CanvasRenderingContext2D): GlyphPaint[] {
  const paints: GlyphPaint[] = [];
  const originalFill = context.fill.bind(context);
  context.fill = ((...args: Parameters<typeof originalFill>) => {
    const t = context.getTransform();
    paints.push({ x: t.e, y: t.f, color: String(context.fillStyle) });
    return originalFill(...args);
  }) as typeof context.fill;
  return paints;
}

/**
 * node-canvas rejette (`TypeError: Expected DOMMatrix`) les instances
 * `DOMMatrix` que pdfjs construit lui-même pour positionner un motif à
 * hachures (ex. le losange "Perte d'écrêtage" de la légende) — une
 * incompatibilité de version entre pdfjs et node-canvas indépendante de ce
 * projet. On rend ce motif inoffensif en avalant l'erreur : le motif garde
 * sa transformation par défaut au lieu d'être positionné précisément, un
 * compromis acceptable pour une petite icône décorative.
 */
export function tolerateBrokenPatternTransform(context: CanvasRenderingContext2D): void {
  const originalCreatePattern = context.createPattern.bind(context);
  context.createPattern = ((...args: Parameters<typeof originalCreatePattern>) => {
    const pattern = originalCreatePattern(...args);
    if (pattern) {
      const originalSetTransform = pattern.setTransform.bind(pattern);
      pattern.setTransform = ((...transformArgs: Parameters<typeof originalSetTransform>) => {
        try {
          originalSetTransform(...transformArgs);
        } catch {
          // Voir commentaire ci-dessus : transformation ignorée.
        }
      }) as typeof pattern.setTransform;
    }
    return pattern;
  }) as typeof context.createPattern;
}

/** Couleur la plus fréquente parmi les glyphes peints par pdfjs à l'intérieur du rectangle de l'item. */
export function findItemColor(
  paints: GlyphPaint[],
  x0: number,
  y0: number,
  width: number,
): string | undefined {
  const counts = new Map<string, number>();
  for (const p of paints) {
    if (
      Math.abs(p.y - y0) < GLYPH_MATCH_Y_TOLERANCE &&
      p.x >= x0 - GLYPH_MATCH_X_PADDING &&
      p.x <= x0 + width + GLYPH_MATCH_X_PADDING
    ) {
      counts.set(p.color, (counts.get(p.color) ?? 0) + 1);
    }
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [color, count] of counts) {
    if (count > bestCount) {
      best = color;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Dessine le texte de la page sur le canvas déjà rendu par pdfjs.
 *
 * Le renderer canvas de pdfjs ne parvient pas à rastériser correctement les
 * glyphes d'une police intégrée en environnement Node (le texte ressort
 * invisible, seuls les tracés vectoriels et les icônes s'affichent
 * correctement) — un problème confirmé indépendant de ce projet, propre au
 * rendu de polices intégrées par pdfjs hors navigateur (vérifié aussi bien
 * sur les PDF SolarEdge que sur un PDF exporté par LibreOffice). On dessine
 * donc le texte nous-mêmes avec une police système, en repositionnant
 * chaque item via sa matrice de transformation (comme le fait le calque de
 * texte HTML de pdfjs) et en réutilisant la couleur exacte capturée par
 * `captureGlyphPaints`, plutôt que de dépendre du rendu de police intégré.
 */
export async function drawTextItems(
  context: CanvasRenderingContext2D,
  page: PDFPageProxy,
  viewportTransform: Matrix,
  glyphPaints: GlyphPaint[],
): Promise<void> {
  const content = await page.getTextContent();
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
    // item est ici garanti être un TextItem (a toujours .width) grâce au
    // filtre "transform" in item ci-dessus, qui exclut TextMarkedContent.
    const itemWidth = item.width * viewportTransform[0];

    context.save();
    context.resetTransform();
    context.transform(tx[0], tx[1], tx[2], tx[3], tx[4], tx[5]);
    context.font = `1px ${CHART_FONT_FAMILY}`;
    context.fillStyle = findItemColor(glyphPaints, tx[4], tx[5], itemWidth) ?? TEXT_COLOR_FALLBACK;
    context.fillText(item.str, 0, 0);
    context.restore();
  }
}
