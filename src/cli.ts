#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { buildStorageValues, buildValues } from "./calc.js";
import {
  renderAnnualResultsChart,
  renderAnnualResultsChartStorage,
} from "./chart/annualResultsChart.js";
import { checkDimensioningConsistency } from "./dimensioningCheck.js";
import { openPdfPage } from "./pdf/document.js";
import { extractFromPdfText, extractFromPdfTextStorage } from "./pdf/extractValues.js";
import { findMonthlyEnergyChartBounds } from "./pdf/monthlyEnergyChartBounds.js";
import { getPageTexts } from "./pdf/reader.js";
import { renderChartImage } from "./pdf/renderChart.js";
import { appendSlides } from "./pptx/mergeSlides.js";
import { replaceChartImage, replaceMonthlyChartImage } from "./pptx/replaceImage.js";
import { replaceRuns } from "./pptx/replaceText.js";
import { buildSlide1Replacements } from "./pptx/slide1Map.js";
import {
  SLIDE2_OUT_OF_SCOPE_TEXTS,
  buildSlide2Replacements,
} from "./pptx/slide2Map.js";
import { buildSlide2ReplacementsStorage } from "./pptx/slide2MapStorage.js";
import {
  getEntryText,
  openPptx,
  setEntryText,
  writePptx,
  type Pptx,
} from "./pptx/zip.js";
import type { SlideValues } from "./types.js";

type Scenario = "sans-stockage" | "stockage" | "comparaison";
/** Scénarios adossés à un unique template pptx (à l'exclusion de "comparaison", qui combine les deux). */
type TemplateScenario = Extract<Scenario, "sans-stockage" | "stockage">;

const SCENARIOS: readonly Scenario[] = ["sans-stockage", "stockage", "comparaison"];

const TEMPLATE_PPTX: Record<TemplateScenario, string> = {
  "sans-stockage":
    "test/data/Scenario 1 sans stockage Projet_Ombriere_Rixhiem.pptx",
  stockage: "test/data/scenario 1 avec stockage Projet_Ombriere_Rixhiem.pptx",
};

const CHART_IMAGE_ENTRY: Record<TemplateScenario, string> = {
  "sans-stockage": "ppt/media/image8.png",
  stockage: "ppt/media/image5.png",
};

const MONTHLY_CHART_PAGE_NUMBER = 3;
/** Numéros des slides du template "avec stockage" reportées dans le pptx de comparaison. */
const COMPARAISON_APPENDED_SLIDES = [2, 3];

type CliArgs =
  | { scenario: TemplateScenario; pdf: string; rangees: number; output: string }
  | {
      scenario: "comparaison";
      pdfSansStockage: string;
      pdfAvecStockage: string;
      rangees: number;
      output: string;
    };

function usage(): string {
  return [
    "Usage :",
    "  --pdf <chemin du PDF SolarEdge> --rangees <nombre de rangées> [--scenario sans-stockage|stockage] [--output <chemin du pptx de sortie>]",
    "  --scenario comparaison --pdf-sans-stockage <chemin> --pdf-avec-stockage <chemin> --rangees <nombre de rangées> [--output <chemin du pptx de sortie>]",
  ].join("\n");
}

function parseScenario(raw: string | undefined): Scenario {
  if (raw === undefined) {
    return "sans-stockage";
  }
  if (!SCENARIOS.includes(raw as Scenario)) {
    throw new Error(
      `--scenario invalide : "${raw}". Valeurs autorisées : ${SCENARIOS.join(", ")}.`,
    );
  }
  return raw as Scenario;
}

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Argument invalide : "${key ?? ""}". ${usage()}`);
    }
    args.set(key.slice(2), value);
  }

  const scenario = parseScenario(args.get("scenario"));

  const rangeesRaw = args.get("rangees");
  if (!rangeesRaw) {
    throw new Error(
      `Argument manquant : --rangees (le nombre de rangées n'est pas extractible du PDF, saisie manuelle requise). ${usage()}`,
    );
  }
  const rangees = Number.parseInt(rangeesRaw, 10);
  if (!Number.isFinite(rangees) || rangees <= 0) {
    throw new Error(
      `--rangees doit être un entier positif, reçu : "${rangeesRaw}"`,
    );
  }

  if (scenario === "comparaison") {
    const pdfSansStockage = args.get("pdf-sans-stockage");
    const pdfAvecStockage = args.get("pdf-avec-stockage");
    if (!pdfSansStockage || !pdfAvecStockage) {
      throw new Error(
        `Arguments manquants : --pdf-sans-stockage et --pdf-avec-stockage sont requis pour --scenario comparaison. ${usage()}`,
      );
    }
    const output =
      args.get("output") ?? defaultOutputPath(pdfSansStockage, "_comparaison");
    return { scenario, pdfSansStockage, pdfAvecStockage, rangees, output };
  }

  const pdf = args.get("pdf");
  if (!pdf) {
    throw new Error(`Argument manquant : --pdf. ${usage()}`);
  }
  const output = args.get("output") ?? defaultOutputPath(pdf);
  return { scenario, pdf, rangees, output };
}

function defaultOutputPath(pdfPath: string, suffix = ""): string {
  const base = path.basename(pdfPath, path.extname(pdfPath));
  return path.join("output", `${base}${suffix}.pptx`);
}

/** Applique les remplacements de slide 1 (identiques pour les deux scénarios) et renvoie le nombre appliqué. */
function applySlide1Replacements(zip: Pptx, values: SlideValues): number {
  const slide1Xml = getEntryText(zip, "ppt/slides/slide1.xml");
  const { xml: newSlide1Xml, applied } = replaceRuns(
    slide1Xml,
    buildSlide1Replacements(values),
  );
  setEntryText(zip, "ppt/slides/slide1.xml", newSlide1Xml);
  return applied.length;
}

async function runSansStockage(
  zip: Pptx,
  page1Text: string,
  page2Text: string,
  rangees: number,
): Promise<void> {
  const extracted = extractFromPdfText(page1Text, page2Text);
  const values = buildValues(extracted, rangees);

  console.log("Valeurs extraites du PDF :");
  console.log(`  Nombre de modules          : ${values.nombreModules}`);
  console.log(`  Production annuelle        : ${values.productionAnnuelleMwh} MWh`);
  console.log(`  Ratio de performance       : ${values.ratioDePerformance} %`);
  console.log(`  Taux d'autoconsommation    : ${values.tauxAutoconsommation} %`);
  console.log(`  Surplus de production      : ${values.surplusProduction} %`);
  console.log(`  Taux d'autoproduction      : ${values.tauxAutoproduction} %`);
  console.log(`  Nombre de rangées (manuel) : ${values.rangees}`);
  console.log(`Puissance installée calculée : ${values.puissanceInstallee} kWc`);

  const slide1Applied = applySlide1Replacements(zip, values);

  const slide2Xml = getEntryText(zip, "ppt/slides/slide2.xml");
  const { xml: newSlide2Xml, applied: slide2Applied } = replaceRuns(
    slide2Xml,
    buildSlide2Replacements(values),
  );
  setEntryText(zip, "ppt/slides/slide2.xml", newSlide2Xml);

  console.log(
    `\nRemplacements de texte appliqués : ${slide1Applied + slide2Applied.length} (slide 1 : ${slide1Applied}, slide 2 : ${slide2Applied.length})`,
  );
  console.log(
    `Laissé(s) inchangé(s) volontairement, hors périmètre : ${SLIDE2_OUT_OF_SCOPE_TEXTS.join(", ")}`,
  );

  const chartImage = renderAnnualResultsChart(values);
  replaceChartImage(zip, chartImage, CHART_IMAGE_ENTRY["sans-stockage"]);
  console.log("Image du graphique (slide 2) remplacée.");
}

async function runStockage(
  zip: Pptx,
  pdf: string,
  page1Text: string,
  page2Text: string,
  rangees: number,
): Promise<void> {
  const extracted = extractFromPdfTextStorage(page1Text, page2Text);
  const values = buildStorageValues(extracted, rangees);

  console.log("Valeurs extraites du PDF :");
  console.log(`  Nombre de modules              : ${values.nombreModules}`);
  console.log(`  Production annuelle            : ${values.productionAnnuelleMwh} MWh`);
  console.log(`  Ratio de performance           : ${values.ratioDePerformance} %`);
  console.log(`  Taux d'autoconsommation affiché : ${values.tauxAutoconsommationAffichage} %`);
  console.log(`  Taux d'autoproduction (stockage): ${values.tauxAutoproductionStockage} %`);
  console.log(`  Nombre de rangées (manuel)      : ${values.rangees}`);
  console.log(`Puissance installée calculée      : ${values.puissanceInstallee} kWc`);

  const slide1Applied = applySlide1Replacements(zip, values);

  const slide2Xml = getEntryText(zip, "ppt/slides/slide2.xml");
  const { xml: newSlide2Xml, applied: slide2Applied } = replaceRuns(
    slide2Xml,
    buildSlide2ReplacementsStorage(values),
  );
  setEntryText(zip, "ppt/slides/slide2.xml", newSlide2Xml);

  console.log(
    `\nRemplacements de texte appliqués : ${slide1Applied + slide2Applied.length} (slide 1 : ${slide1Applied}, slide 2 : ${slide2Applied.length})`,
  );

  const chartImage = renderAnnualResultsChartStorage(values);
  replaceChartImage(zip, chartImage, CHART_IMAGE_ENTRY.stockage);
  console.log("Image du graphique (slide 2) remplacée.");

  const monthlyChartPage = await openPdfPage(pdf, MONTHLY_CHART_PAGE_NUMBER);
  const monthlyChartBounds = await findMonthlyEnergyChartBounds(monthlyChartPage);
  const monthlyChartImage = await renderChartImage(
    pdf,
    MONTHLY_CHART_PAGE_NUMBER,
    monthlyChartBounds,
  );
  await replaceMonthlyChartImage(zip, monthlyChartImage);
  console.log("Image du graphique (slide 3) remplacée.");
}

/**
 * Scénario "comparaison" : lance les deux pipelines existants (sans-stockage
 * et avec-stockage) sur leurs PDF respectifs, puis fusionne les résultats en
 * un seul pptx de 4 slides — les 2 slides sans-stockage suivies des 2
 * dernières slides (résultats + énergie mensuelle) du scénario avec-stockage.
 * Suppose que les deux PDF décrivent le même dimensionnement (mêmes
 * ombrières/puissance) ; un avertissement (non bloquant) est émis sinon.
 */
async function runComparaison(
  pdfSansStockage: string,
  pdfAvecStockage: string,
  rangees: number,
  output: string,
): Promise<void> {
  const [sansPage1Text, sansPage2Text] = await getPageTexts(pdfSansStockage, [1, 2]);
  const sansValues = buildValues(
    extractFromPdfText(sansPage1Text, sansPage2Text),
    rangees,
  );

  const [avecPage1Text, avecPage2Text] = await getPageTexts(pdfAvecStockage, [1, 2]);
  const avecValues = buildStorageValues(
    extractFromPdfTextStorage(avecPage1Text, avecPage2Text),
    rangees,
  );

  for (const warning of checkDimensioningConsistency(sansValues, avecValues)) {
    console.warn(`Avertissement : ${warning}`);
  }

  const sansZip = openPptx(TEMPLATE_PPTX["sans-stockage"]);
  await runSansStockage(sansZip, sansPage1Text, sansPage2Text, rangees);

  const avecZip = openPptx(TEMPLATE_PPTX.stockage);
  await runStockage(avecZip, pdfAvecStockage, avecPage1Text, avecPage2Text, rangees);

  appendSlides(sansZip, avecZip, COMPARAISON_APPENDED_SLIDES);

  await mkdir(path.dirname(output), { recursive: true });
  writePptx(sansZip, output);
  console.log(`\nFichier généré (comparaison, 4 slides) : ${output}`);
}

async function run(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.scenario === "comparaison") {
    await runComparaison(
      args.pdfSansStockage,
      args.pdfAvecStockage,
      args.rangees,
      args.output,
    );
    return;
  }

  const { pdf, rangees, output, scenario } = args;
  const [page1Text, page2Text] = await getPageTexts(pdf, [1, 2]);
  const zip = openPptx(TEMPLATE_PPTX[scenario]);

  if (scenario === "sans-stockage") {
    await runSansStockage(zip, page1Text, page2Text, rangees);
  } else {
    await runStockage(zip, pdf, page1Text, page2Text, rangees);
  }

  await mkdir(path.dirname(output), { recursive: true });
  writePptx(zip, output);
  console.log(`\nFichier généré : ${output}`);
}

run(process.argv.slice(2)).catch((error: unknown) => {
  console.error(
    `Erreur : ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
