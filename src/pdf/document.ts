import { readFile } from "node:fs/promises";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFPageProxy } from "pdfjs-dist";

/** Ouvre une page d'un PDF (utilisé par le rendu/crop du graphique, en plus du lecteur texte simple). */
export async function openPdfPage(
  pdfPath: string,
  pageNumber: number,
): Promise<PDFPageProxy> {
  const data = new Uint8Array(await readFile(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  return doc.getPage(pageNumber);
}
