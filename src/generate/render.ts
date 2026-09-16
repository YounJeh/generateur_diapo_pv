import {
  renderAnnualResultsChart,
  renderAnnualResultsChartStorage,
} from "../chart/annualResultsChart.js";
import { openPdfPage } from "../pdf/document.js";
import { findMonthlyEnergyChartBounds } from "../pdf/monthlyEnergyChartBounds.js";
import { renderChartImage } from "../pdf/renderChart.js";
import { replaceChartImage, replaceMonthlyChartImage } from "../pptx/replaceImage.js";
import { replaceRuns } from "../pptx/replaceText.js";
import { buildSlide1Replacements } from "../pptx/slide1Map.js";
import { buildSlide2Replacements } from "../pptx/slide2Map.js";
import {
  buildSlide2ReplacementsStorage,
  buildSlide3ReplacementsStorage,
} from "../pptx/slide2MapStorage.js";
import { getEntryText, openPptx, setEntryText, type Pptx } from "../pptx/zip.js";
import type { SlideValues, StorageSlideValues } from "../types.js";
import { TEMPLATE_PPTX } from "./types.js";

const CHART_IMAGE_ENTRY = {
  "sans-stockage": "ppt/media/image8.png",
  stockage: "ppt/media/image5.png",
} as const;

const MONTHLY_CHART_PAGE_NUMBER = 3;

export interface RenderSansStockageResult {
  zip: Pptx;
  slide1Applied: number;
  slide2Applied: number;
}

export interface RenderStockageResult {
  zip: Pptx;
  slide1Applied: number;
  slide2Applied: number;
  slide3Applied: number;
}

/** Applique les remplacements de slide 1 (identiques pour les deux scénarios) et renvoie le nombre appliqué. */
function applySlide1Replacements(
  zip: Pptx,
  values: SlideValues,
  scenarioNumero: number,
): number {
  const slide1Xml = getEntryText(zip, "ppt/slides/slide1.xml");
  const { xml: newSlide1Xml, applied } = replaceRuns(
    slide1Xml,
    buildSlide1Replacements(values, scenarioNumero),
  );
  setEntryText(zip, "ppt/slides/slide1.xml", newSlide1Xml);
  return applied.length;
}

/**
 * Applique des valeurs déjà extraites/calculées (voir `extract.ts`) au
 * template pptx "sans stockage" : textes (slides 1-2) + image du graphique
 * annuel. Retourne le zip en mémoire (aucune écriture disque) ainsi que les
 * compteurs de remplacements appliqués, pour que l'appelant (CLI, API web)
 * puisse les afficher/exposer sans que ce module fasse d'I/O lui-même.
 */
export function renderSansStockage(
  values: SlideValues,
  scenarioNumero = 1,
): RenderSansStockageResult {
  const zip = openPptx(TEMPLATE_PPTX["sans-stockage"]);

  const slide1Applied = applySlide1Replacements(zip, values, scenarioNumero);

  const slide2Xml = getEntryText(zip, "ppt/slides/slide2.xml");
  const { xml: newSlide2Xml, applied: slide2Applied } = replaceRuns(
    slide2Xml,
    buildSlide2Replacements(values),
  );
  setEntryText(zip, "ppt/slides/slide2.xml", newSlide2Xml);

  const chartImage = renderAnnualResultsChart(values);
  replaceChartImage(zip, chartImage, CHART_IMAGE_ENTRY["sans-stockage"]);

  return { zip, slide1Applied, slide2Applied: slide2Applied.length };
}

/**
 * Équivalent de `renderSansStockage` pour le scénario "avec stockage".
 * Nécessite le chemin du PDF source (pas seulement les valeurs déjà
 * extraites) pour la slide 3 : son image est une capture recadrée du
 * graphique mensuel de la page 3 du PDF, pas une reconstruction à partir de
 * valeurs.
 */
export async function renderStockage(
  pdf: string,
  values: StorageSlideValues,
  scenarioNumero = 1,
): Promise<RenderStockageResult> {
  const zip = openPptx(TEMPLATE_PPTX.stockage);

  const slide1Applied = applySlide1Replacements(zip, values, scenarioNumero);

  const slide2Xml = getEntryText(zip, "ppt/slides/slide2.xml");
  const { xml: newSlide2Xml, applied: slide2Applied } = replaceRuns(
    slide2Xml,
    buildSlide2ReplacementsStorage(values),
  );
  setEntryText(zip, "ppt/slides/slide2.xml", newSlide2Xml);

  const slide3TitleXml = getEntryText(zip, "ppt/slides/slide3.xml");
  const { xml: newSlide3TitleXml, applied: slide3Applied } = replaceRuns(
    slide3TitleXml,
    buildSlide3ReplacementsStorage(values),
  );
  setEntryText(zip, "ppt/slides/slide3.xml", newSlide3TitleXml);

  const chartImage = renderAnnualResultsChartStorage(values);
  replaceChartImage(zip, chartImage, CHART_IMAGE_ENTRY.stockage);

  const monthlyChartPage = await openPdfPage(pdf, MONTHLY_CHART_PAGE_NUMBER);
  const monthlyChartBounds = await findMonthlyEnergyChartBounds(monthlyChartPage);
  const monthlyChartImage = await renderChartImage(
    pdf,
    MONTHLY_CHART_PAGE_NUMBER,
    monthlyChartBounds,
  );
  await replaceMonthlyChartImage(zip, monthlyChartImage);

  return {
    zip,
    slide1Applied,
    slide2Applied: slide2Applied.length,
    slide3Applied: slide3Applied.length,
  };
}
