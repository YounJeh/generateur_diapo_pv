import type { PDFPageProxy } from "pdfjs-dist";

/** Sous-ensemble d'un item texte pdfjs qui porte une position (exclut TextMarkedContent). */
interface TextItemWithPosition {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/** Zone en points PDF (origine bas-gauche, y croissant vers le haut). */
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const TOP_ANCHOR = "RÉSULTATS DE CONSOMMATION";
const BOTTOM_ANCHOR = "Énergie solaire";
const PADDING = 12;

interface PositionedItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Localise la zone du graphique "RÉSULTATS DE CONSOMMATION ET DE PRODUCTION
 * ANNUELLES" sur la page 2, en repérant le texte-ancre du titre et celui de
 * la dernière ligne de légende, puis en englobant tout le contenu textuel
 * compris entre les deux. Ne dépend d'aucune coordonnée fixe : si la mise en
 * page bouge légèrement (mais garde les mêmes libellés), la zone suit.
 */
export async function findChartBounds(page: PDFPageProxy): Promise<Bounds> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();

  const items: PositionedItem[] = content.items
    .filter((item) => "transform" in item)
    .map((item) => {
      const positioned = item as unknown as TextItemWithPosition;
      return {
        str: positioned.str,
        x: positioned.transform[4],
        y: positioned.transform[5],
        width: positioned.width,
        height: positioned.height,
      };
    });

  const topAnchor = items.find((item) => item.str.includes(TOP_ANCHOR));
  if (!topAnchor) {
    throw new Error(
      `Zone du graphique introuvable : le texte-ancre haut "${TOP_ANCHOR}" n'a pas été trouvé sur la page.`,
    );
  }

  const bottomAnchor = items.find((item) => item.str.includes(BOTTOM_ANCHOR));
  if (!bottomAnchor) {
    throw new Error(
      `Zone du graphique introuvable : le texte-ancre bas "${BOTTOM_ANCHOR}" n'a pas été trouvé sur la page.`,
    );
  }

  const yTop = topAnchor.y + topAnchor.height;
  const yBottom = bottomAnchor.y;

  const within = items.filter(
    (item) => item.y >= yBottom - 0.01 && item.y <= yTop + 0.01,
  );

  const xLeft = Math.min(...within.map((item) => item.x));
  const xRight = Math.max(...within.map((item) => item.x + item.width));

  return {
    x0: Math.max(0, xLeft - PADDING),
    y0: Math.max(0, yBottom - PADDING),
    x1: Math.min(viewport.width, xRight + PADDING),
    y1: Math.min(viewport.height, yTop + PADDING),
  };
}
