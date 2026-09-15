import type { ExtractedValues } from "../types.js";

/** Réduit tous les espaces/retours à la ligne du texte pdfjs (un item par ligne) à un seul espace. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extract(
  text: string,
  pattern: RegExp,
  fieldName: string,
): string {
  const match = pattern.exec(text);
  if (!match || match[1] === undefined) {
    throw new Error(
      `Impossible d'extraire "${fieldName}" : le motif attendu est introuvable dans le texte du PDF. La structure du rapport a peut-être changé.`,
    );
  }
  return match[1];
}

export function extractNombreModules(page1Text: string): number {
  const raw = extract(normalize(page1Text), /(\d+)\s*Modules PV/i, "nombre de modules");
  return Number.parseInt(raw, 10);
}

export function extractProductionAnnuelleMwh(page1Text: string): string {
  return extract(
    normalize(page1Text),
    /D['’]énergie Annuelle\s+(\d+,\d+)\s*MWh/i,
    "production d'énergie annuelle",
  );
}

export function extractRatioDePerformance(page1Text: string): string {
  return extract(
    normalize(page1Text),
    /Ratio De\s+Performance\s+(\d+(?:,\d+)?)\s*%/i,
    "ratio de performance",
  );
}

export function extractTauxAutoconsommation(page2Text: string): number {
  const raw = extract(
    normalize(page2Text),
    /Vers le b[âa]timent[^)]*\((\d+)%\)/i,
    "taux d'autoconsommation",
  );
  return Number.parseInt(raw, 10);
}

export function extractSurplusProduction(page2Text: string): number {
  const raw = extract(
    normalize(page2Text),
    /Vers le r[ée]seau[^)]*\((\d+)%\)/i,
    "surplus de production",
  );
  return Number.parseInt(raw, 10);
}

export function extractTauxAutoproduction(page2Text: string): number {
  const raw = extract(
    normalize(page2Text),
    /Depuis le PV[^)]*\((\d+)%\)/i,
    "taux d'autoproduction",
  );
  return Number.parseInt(raw, 10);
}

export function extractFromPdfText(
  page1Text: string,
  page2Text: string,
): ExtractedValues {
  return {
    nombreModules: extractNombreModules(page1Text),
    productionAnnuelleMwh: extractProductionAnnuelleMwh(page1Text),
    ratioDePerformance: extractRatioDePerformance(page1Text),
    tauxAutoconsommation: extractTauxAutoconsommation(page2Text),
    surplusProduction: extractSurplusProduction(page2Text),
    tauxAutoproduction: extractTauxAutoproduction(page2Text),
  };
}
