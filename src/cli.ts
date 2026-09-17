#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { buildComparaisonPptx, type CaseResult } from "./generate/comparaison.js";
import { extractSansStockage, extractStockage } from "./generate/extract.js";
import { renderSansStockageStandalone, renderStockageStandalone } from "./generate/render.js";
import { SCENARIOS, type Groupe, type Scenario, type TemplateScenario } from "./generate/types.js";
import { SLIDE2_OUT_OF_SCOPE_TEXTS } from "./pptx/slide2Map.js";
import { writePptx } from "./pptx/zip.js";
import type { SlideValues, StorageSlideValues } from "./types.js";

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

function printExtractedSansStockage(values: SlideValues): void {
  console.log("Valeurs extraites du PDF :");
  console.log(`  Nombre de modules          : ${values.nombreModules}`);
  console.log(`  Production annuelle        : ${values.productionAnnuelleMwh} MWh`);
  console.log(`  Ratio de performance       : ${values.ratioDePerformance} %`);
  console.log(`  Taux d'autoconsommation    : ${values.tauxAutoconsommation} %`);
  console.log(`  Surplus de production      : ${values.surplusProduction} %`);
  console.log(`  Taux d'autoproduction      : ${values.tauxAutoproduction} %`);
  console.log(`  Nombre de rangées (manuel) : ${values.rangees}`);
  console.log(`Puissance installée calculée : ${values.puissanceInstallee} kWc`);
}

function printExtractedStockage(values: StorageSlideValues): void {
  console.log("Valeurs extraites du PDF :");
  console.log(`  Nombre de modules              : ${values.nombreModules}`);
  console.log(`  Production annuelle            : ${values.productionAnnuelleMwh} MWh`);
  console.log(`  Ratio de performance           : ${values.ratioDePerformance} %`);
  console.log(`  Taux d'autoconsommation affiché : ${values.tauxAutoconsommationAffichage} %`);
  console.log(`  Taux d'autoproduction (stockage): ${values.tauxAutoproductionStockage} %`);
  console.log(`  Nombre de rangées (manuel)      : ${values.rangees}`);
  console.log(`Puissance installée calculée      : ${values.puissanceInstallee} kWc`);
}

function printRenderSummarySansStockage(slide1Applied: number, slide2Applied: number): void {
  console.log(
    `\nRemplacements de texte appliqués : ${slide1Applied + slide2Applied} (slide 1 : ${slide1Applied}, slide 2 : ${slide2Applied})`,
  );
  console.log(
    `Laissé(s) inchangé(s) volontairement, hors périmètre : ${SLIDE2_OUT_OF_SCOPE_TEXTS.join(", ")}`,
  );
  console.log("Image du graphique (slide 2) remplacée.");
}

function printRenderSummaryStockage(
  slide1Applied: number,
  slide2Applied: number,
  slide3Applied: number,
): void {
  console.log(
    `\nRemplacements de texte appliqués : ${slide1Applied + slide2Applied + slide3Applied} (slide 1 : ${slide1Applied}, slide 2 : ${slide2Applied}, slide 3 : ${slide3Applied})`,
  );
  console.log("Image du graphique (slide 2) remplacée.");
  console.log("Image du graphique (slide 3) remplacée.");
}

function printCaseResult(cas: CaseResult): void {
  if (cas.scenario === "sans-stockage") {
    printExtractedSansStockage(cas.values as SlideValues);
    printRenderSummarySansStockage(cas.slide1Applied, cas.slide2Applied);
  } else {
    printExtractedStockage(cas.values as StorageSlideValues);
    printRenderSummaryStockage(cas.slide1Applied, cas.slide2Applied, cas.slide3Applied!);
  }
}

async function runComparaison(groupes: Groupe[], output: string): Promise<void> {
  const result = await buildComparaisonPptx(groupes);

  for (const groupe of result.groupes) {
    console.log(`\n=== Groupe ${groupe.scenarioNumero} (${groupe.rangees} rangées) ===`);
    for (const cas of groupe.cases) {
      printCaseResult(cas);
    }
    for (const warning of result.warnings) {
      if (warning.startsWith(`Avertissement (groupe ${groupe.scenarioNumero}) `)) {
        console.warn(warning);
      }
    }
  }

  await mkdir(path.dirname(output), { recursive: true });
  writePptx(result.zip, output);
  console.log(
    `\nFichier généré (comparaison, ${groupes.length} groupe(s), ${result.totalSlides} slides) : ${output}`,
  );
}

async function run(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.scenario === "comparaison") {
    await runComparaison(args.groupes, args.output);
    return;
  }

  const { pdf, rangees, output, scenario } = args;

  if (scenario === "sans-stockage") {
    const values = await extractSansStockage(pdf, rangees);
    printExtractedSansStockage(values);
    const { zip, slide1Applied, slide2Applied } = renderSansStockageStandalone(values);
    printRenderSummarySansStockage(slide1Applied, slide2Applied);
    await mkdir(path.dirname(output), { recursive: true });
    writePptx(zip, output);
  } else {
    const values = await extractStockage(pdf, rangees);
    printExtractedStockage(values);
    const { zip, slide1Applied, slide2Applied, slide3Applied } = await renderStockageStandalone(
      pdf,
      values,
    );
    printRenderSummaryStockage(slide1Applied, slide2Applied, slide3Applied);
    await mkdir(path.dirname(output), { recursive: true });
    writePptx(zip, output);
  }

  console.log(`\nFichier généré : ${output}`);
}

run(process.argv.slice(2)).catch((error: unknown) => {
  console.error(
    `Erreur : ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
