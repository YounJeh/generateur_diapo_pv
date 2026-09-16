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
import {
  buildSlide2ReplacementsStorage,
  buildSlide3ReplacementsStorage,
} from "./pptx/slide2MapStorage.js";
import {
  getEntryText,
  openPptx,
  setEntryText,
  writePptx,
  type Pptx,
} from "./pptx/zip.js";
import type { SlideValues, StorageSlideValues } from "./types.js";

type Scenario = "sans-stockage" | "stockage" | "comparaison";
/** Scénarios adossés à un unique template pptx (à l'exclusion de "comparaison", qui combine les deux). */
type TemplateScenario = Extract<Scenario, "sans-stockage" | "stockage">;

const SCENARIOS: readonly Scenario[] = ["sans-stockage", "stockage", "comparaison"];

const TEMPLATE_PPTX: Record<TemplateScenario, string> = {
  "sans-stockage": "assets/templates/template-sans-stockage.pptx",
  stockage: "assets/templates/template-avec-stockage.pptx",
};

const CHART_IMAGE_ENTRY: Record<TemplateScenario, string> = {
  "sans-stockage": "ppt/media/image8.png",
  stockage: "ppt/media/image5.png",
};

const MONTHLY_CHART_PAGE_NUMBER = 3;
/** Numéros de slides d'un template, hors slide de titre (slide 1). */
const CONTENT_SLIDE_NUMBERS: Record<TemplateScenario, readonly number[]> = {
  "sans-stockage": [2],
  stockage: [2, 3],
};

/**
 * Groupe de dimensionnement pour le scénario "comparaison" : un nombre de
 * rangées (donc une puissance) donné, avec un cas sans-stockage et/ou un cas
 * avec-stockage. Deux PDF appartiennent au même groupe s'ils décrivent le
 * même dimensionnement physique (mêmes ombrières/puissance).
 */
interface Groupe {
  rangees: number;
  pdfSansStockage?: string;
  pdfAvecStockage?: string;
}

type CliArgs =
  | { scenario: TemplateScenario; pdf: string; rangees: number; output: string }
  | { scenario: "comparaison"; groupes: Groupe[]; output: string };

function usage(): string {
  return [
    "Usage :",
    "  --pdf <chemin du PDF SolarEdge> --rangees <nombre de rangées> [--scenario sans-stockage|stockage] [--output <chemin du pptx de sortie>]",
    "  --scenario comparaison --groupe-1-rangees <nombre> [--groupe-1-pdf-sans-stockage <chemin>] [--groupe-1-pdf-avec-stockage <chemin>] [--groupe-2-rangees ... ] [--output <chemin du pptx de sortie>]",
    "    Chaque groupe représente un dimensionnement (puissance/rangées) et doit fournir au moins un des deux PDF.",
    "    Les slides sont assemblées dans l'ordre des groupes ; à l'intérieur d'un groupe, sans-stockage précède avec-stockage.",
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

  if (scenario === "comparaison") {
    const groupes = parseGroupes(args);
    // Chaque groupe est validé (dans parseGroupes) pour avoir au moins un PDF.
    const firstPdf = groupes[0].pdfSansStockage ?? groupes[0].pdfAvecStockage!;
    const output = args.get("output") ?? defaultOutputPath(firstPdf, "_comparaison");
    return { scenario, groupes, output };
  }

  const rangees = parsePositiveInt(
    args.get("rangees"),
    "--rangees",
    "(le nombre de rangées n'est pas extractible du PDF, saisie manuelle requise)",
  );

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

function parsePositiveInt(raw: string | undefined, flag: string, missingHint = ""): number {
  if (!raw) {
    throw new Error(
      `Argument manquant : ${flag}${missingHint ? ` ${missingHint}` : ""}. ${usage()}`,
    );
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flag} doit être un entier positif, reçu : "${raw}"`);
  }
  return value;
}

/**
 * Extrait les groupes de dimensionnement du scénario "comparaison" à partir
 * des flags --groupe-N-rangees / --groupe-N-pdf-sans-stockage /
 * --groupe-N-pdf-avec-stockage. Les indices N doivent être contigus à partir
 * de 1 (ordre = ordre d'assemblage des slides).
 */
function parseGroupes(args: Map<string, string>): Groupe[] {
  const groupeIndexPattern = /^groupe-(\d+)-(rangees|pdf-sans-stockage|pdf-avec-stockage)$/;
  const indices = new Set<number>();
  for (const key of args.keys()) {
    const match = key.match(groupeIndexPattern);
    if (match) {
      indices.add(Number.parseInt(match[1], 10));
    }
  }

  if (indices.size === 0) {
    throw new Error(
      `Arguments manquants : au moins --groupe-1-rangees et un PDF (--groupe-1-pdf-sans-stockage et/ou --groupe-1-pdf-avec-stockage) sont requis pour --scenario comparaison. ${usage()}`,
    );
  }

  const sortedIndices = [...indices].sort((a, b) => a - b);
  sortedIndices.forEach((index, position) => {
    const expected = position + 1;
    if (index !== expected) {
      throw new Error(
        `Groupes non contigus : --groupe-${expected}-* est manquant (des flags --groupe-${index}-* existent sans lui). ${usage()}`,
      );
    }
  });

  return sortedIndices.map((n) => {
    const rangees = parsePositiveInt(args.get(`groupe-${n}-rangees`), `--groupe-${n}-rangees`);
    const pdfSansStockage = args.get(`groupe-${n}-pdf-sans-stockage`);
    const pdfAvecStockage = args.get(`groupe-${n}-pdf-avec-stockage`);
    if (!pdfSansStockage && !pdfAvecStockage) {
      throw new Error(
        `Arguments manquants : --groupe-${n}-pdf-sans-stockage et/ou --groupe-${n}-pdf-avec-stockage requis pour le groupe ${n}. ${usage()}`,
      );
    }
    return { rangees, pdfSansStockage, pdfAvecStockage };
  });
}

/** Applique les remplacements de slide 1 (identiques pour les deux scénarios) et renvoie le nombre appliqué. */
function applySlide1Replacements(
  zip: Pptx,
  values: SlideValues,
  scenarioNumero = 1,
): number {
  const slide1Xml = getEntryText(zip, "ppt/slides/slide1.xml");
  const { xml: newSlide1Xml, applied } = replaceRuns(
    slide1Xml,
    buildSlide1Replacements(values, scenarioNumero),
  );
  setEntryText(zip, "ppt/slides/slide1.xml", newSlide1Xml);
  return applied.length;
}

async function runSansStockage(
  zip: Pptx,
  page1Text: string,
  page2Text: string,
  rangees: number,
  scenarioNumero = 1,
): Promise<SlideValues> {
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

  const slide1Applied = applySlide1Replacements(zip, values, scenarioNumero);

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

  return values;
}

async function runStockage(
  zip: Pptx,
  pdf: string,
  page1Text: string,
  page2Text: string,
  rangees: number,
  scenarioNumero = 1,
): Promise<StorageSlideValues> {
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

  console.log(
    `\nRemplacements de texte appliqués : ${slide1Applied + slide2Applied.length + slide3Applied.length} (slide 1 : ${slide1Applied}, slide 2 : ${slide2Applied.length}, slide 3 : ${slide3Applied.length})`,
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

  return values;
}

interface Cas {
  scenario: TemplateScenario;
  pdf: string;
}

/** Cas d'un groupe, dans l'ordre d'assemblage voulu : sans-stockage avant avec-stockage. */
function orderedCases(groupe: Groupe): Cas[] {
  const cases: Cas[] = [];
  if (groupe.pdfSansStockage) {
    cases.push({ scenario: "sans-stockage", pdf: groupe.pdfSansStockage });
  }
  if (groupe.pdfAvecStockage) {
    cases.push({ scenario: "stockage", pdf: groupe.pdfAvecStockage });
  }
  return cases;
}

/**
 * Scénario "comparaison" : assemble N groupes de dimensionnement dans
 * l'ordre donné. Chaque groupe fournit un cas sans-stockage et/ou un cas
 * avec-stockage (même dimensionnement, donc même --groupe-N-rangees) ; à
 * l'intérieur d'un groupe, sans-stockage précède avec-stockage. Le premier
 * cas de chaque groupe apporte sa slide de titre (renumérotée "SCENARIO N"
 * selon la position du groupe) ; les cas suivants n'apportent que leurs
 * slides de contenu. La cohérence de dimensionnement (modules/puissance)
 * entre les deux cas d'un même groupe est vérifiée (avertissement non
 * bloquant) ; aucune vérification n'est faite entre groupes, qui décrivent
 * intentionnellement des dimensionnements différents.
 */
async function runComparaison(groupes: Groupe[], output: string): Promise<void> {
  let baseZip: Pptx | undefined;
  let totalSlides = 0;

  for (let groupeIndex = 0; groupeIndex < groupes.length; groupeIndex += 1) {
    const groupe = groupes[groupeIndex];
    const scenarioNumero = groupeIndex + 1;
    const cases = orderedCases(groupe);
    console.log(`\n=== Groupe ${scenarioNumero} (${groupe.rangees} rangées) ===`);

    let sansValues: SlideValues | undefined;
    let avecValues: StorageSlideValues | undefined;

    for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
      const isGroupeFirstCase = caseIndex === 0;
      const cas = cases[caseIndex];
      const [page1Text, page2Text] = await getPageTexts(cas.pdf, [1, 2]);
      const zip = openPptx(TEMPLATE_PPTX[cas.scenario]);

      if (cas.scenario === "sans-stockage") {
        sansValues = await runSansStockage(
          zip,
          page1Text,
          page2Text,
          groupe.rangees,
          scenarioNumero,
        );
      } else {
        avecValues = await runStockage(
          zip,
          cas.pdf,
          page1Text,
          page2Text,
          groupe.rangees,
          scenarioNumero,
        );
      }

      if (!baseZip) {
        baseZip = zip;
        totalSlides += CONTENT_SLIDE_NUMBERS[cas.scenario].length + 1;
        continue;
      }

      const slideNumbers = isGroupeFirstCase
        ? [1, ...CONTENT_SLIDE_NUMBERS[cas.scenario]]
        : CONTENT_SLIDE_NUMBERS[cas.scenario];
      appendSlides(baseZip, zip, slideNumbers);
      totalSlides += slideNumbers.length;
    }

    if (sansValues && avecValues) {
      for (const warning of checkDimensioningConsistency(sansValues, avecValues)) {
        console.warn(`Avertissement (groupe ${scenarioNumero}) : ${warning}`);
      }
    }
  }

  if (!baseZip) {
    throw new Error("Aucun groupe valide fourni pour le scénario comparaison.");
  }

  await mkdir(path.dirname(output), { recursive: true });
  writePptx(baseZip, output);
  console.log(
    `\nFichier généré (comparaison, ${groupes.length} groupe(s), ${totalSlides} slides) : ${output}`,
  );
}

async function run(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.scenario === "comparaison") {
    await runComparaison(args.groupes, args.output);
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
