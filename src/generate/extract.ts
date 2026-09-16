import { buildStorageValues, buildValues } from "../calc.js";
import { extractFromPdfText, extractFromPdfTextStorage } from "../pdf/extractValues.js";
import { getPageTexts } from "../pdf/reader.js";
import type { SlideValues, StorageSlideValues } from "../types.js";

/**
 * Lit les pages 1-2 du PDF et calcule les valeurs du scénario "sans
 * stockage" (extraction + calculs dérivés), sans toucher au pptx. Utilisé à
 * la fois par la CLI et par l'étape "vérifier les données" de l'API web.
 */
export async function extractSansStockage(
  pdfPath: string,
  rangees: number,
): Promise<SlideValues> {
  const [page1Text, page2Text] = await getPageTexts(pdfPath, [1, 2]);
  const extracted = extractFromPdfText(page1Text, page2Text);
  return buildValues(extracted, rangees);
}

/** Équivalent de `extractSansStockage` pour le scénario "avec stockage". */
export async function extractStockage(
  pdfPath: string,
  rangees: number,
): Promise<StorageSlideValues> {
  const [page1Text, page2Text] = await getPageTexts(pdfPath, [1, 2]);
  const extracted = extractFromPdfTextStorage(page1Text, page2Text);
  return buildStorageValues(extracted, rangees);
}
