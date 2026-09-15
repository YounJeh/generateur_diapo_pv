import { readFile } from "node:fs/promises";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Lecteur PDF simple : lit uniquement les pages demandées et retourne
 * leur texte linéarisé (une chaîne par page, dans l'ordre de pageNumbers).
 */
export async function getPageTexts(
  pdfPath: string,
  pageNumbers: number[],
): Promise<string[]> {
  const data = new Uint8Array(await readFile(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const texts: string[] = [];
  for (const pageNumber of pageNumbers) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join("\n");
    texts.push(pageText);
  }
  return texts;
}
