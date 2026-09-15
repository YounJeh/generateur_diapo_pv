#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { buildValues } from "./calc.js";
import { openPdfPage } from "./pdf/document.js";
import { findChartBounds } from "./pdf/chartBounds.js";
import { extractFromPdfText } from "./pdf/extractValues.js";
import { getPageTexts } from "./pdf/reader.js";
import { renderChartImage } from "./pdf/renderChart.js";
import { replaceChartImage } from "./pptx/replaceImage.js";
import { replaceRuns } from "./pptx/replaceText.js";
import { buildSlide1Replacements } from "./pptx/slide1Map.js";
import {
  SLIDE2_OUT_OF_SCOPE_TEXTS,
  buildSlide2Replacements,
} from "./pptx/slide2Map.js";
import { getEntryText, openPptx, setEntryText, writePptx } from "./pptx/zip.js";

const TEMPLATE_PPTX =
  "test/data/Scenario 1 sans stockage Projet_Ombriere_Rixhiem.pptx";
const CHART_PAGE_NUMBER = 2;

interface CliArgs {
  pdf: string;
  rangees: number;
  output: string;
}

function usage(): string {
  return "Usage : --pdf <chemin du PDF SolarEdge> --rangees <nombre de rangées> [--output <chemin du pptx de sortie>]";
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

  const pdf = args.get("pdf");
  if (!pdf) {
    throw new Error(`Argument manquant : --pdf. ${usage()}`);
  }

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

  const output = args.get("output") ?? defaultOutputPath(pdf);
  return { pdf, rangees, output };
}

function defaultOutputPath(pdfPath: string): string {
  const base = path.basename(pdfPath, path.extname(pdfPath));
  return path.join("output", `${base}.pptx`);
}

async function run(argv: string[]): Promise<void> {
  const { pdf, rangees, output } = parseArgs(argv);

  const [page1Text, page2Text] = await getPageTexts(pdf, [1, 2]);
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

  const zip = openPptx(TEMPLATE_PPTX);

  const slide1Xml = getEntryText(zip, "ppt/slides/slide1.xml");
  const { xml: newSlide1Xml, applied: slide1Applied } = replaceRuns(
    slide1Xml,
    buildSlide1Replacements(values),
  );
  setEntryText(zip, "ppt/slides/slide1.xml", newSlide1Xml);

  const slide2Xml = getEntryText(zip, "ppt/slides/slide2.xml");
  const { xml: newSlide2Xml, applied: slide2Applied } = replaceRuns(
    slide2Xml,
    buildSlide2Replacements(values),
  );
  setEntryText(zip, "ppt/slides/slide2.xml", newSlide2Xml);

  console.log(
    `\nRemplacements de texte appliqués : ${slide1Applied.length + slide2Applied.length} (slide 1 : ${slide1Applied.length}, slide 2 : ${slide2Applied.length})`,
  );
  console.log(
    `Laissé(s) inchangé(s) volontairement, hors périmètre : ${SLIDE2_OUT_OF_SCOPE_TEXTS.join(", ")}`,
  );

  const page = await openPdfPage(pdf, CHART_PAGE_NUMBER);
  const bounds = await findChartBounds(page);
  const chartImage = await renderChartImage(pdf, CHART_PAGE_NUMBER, bounds);
  replaceChartImage(zip, chartImage);
  console.log("Image du graphique (slide 2) remplacée.");

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
