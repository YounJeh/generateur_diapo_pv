import { checkDimensioningConsistency } from "../dimensioningCheck.js";
import { appendSlides } from "../pptx/mergeSlides.js";
import type { Pptx } from "../pptx/zip.js";
import type { SlideValues, StorageSlideValues } from "../types.js";
import { extractSansStockage, extractStockage } from "./extract.js";
import { renderSansStockage, renderStockage } from "./render.js";
import type { Groupe, TemplateScenario } from "./types.js";

/** Numéros de slides d'un template, hors slide de titre (slide 1). */
const CONTENT_SLIDE_NUMBERS: Record<TemplateScenario, readonly number[]> = {
  "sans-stockage": [2],
  stockage: [2, 3],
};

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

export interface CaseResult {
  scenario: TemplateScenario;
  values: SlideValues | StorageSlideValues;
  slide1Applied: number;
  slide2Applied: number;
  slide3Applied?: number;
}

export interface GroupeResult {
  scenarioNumero: number;
  rangees: number;
  cases: CaseResult[];
}

export interface ComparaisonResult {
  zip: Pptx;
  totalSlides: number;
  groupes: GroupeResult[];
  /** Avertissements de cohérence de dimensionnement, déjà formatés (préfixés "Avertissement (groupe N) : "), pas encore affichés. */
  warnings: string[];
}

/**
 * Scénario "comparaison" : assemble N groupes de dimensionnement dans
 * l'ordre donné. Chaque groupe fournit un cas sans-stockage et/ou un cas
 * avec-stockage (même dimensionnement, donc même rangées) ; à l'intérieur
 * d'un groupe, sans-stockage précède avec-stockage. Le premier cas de chaque
 * groupe apporte sa slide de titre (renumérotée "SCENARIO N" selon la
 * position du groupe) ; les cas suivants n'apportent que leurs slides de
 * contenu. La cohérence de dimensionnement (modules/puissance) entre les
 * deux cas d'un même groupe est vérifiée (avertissement non bloquant,
 * retourné dans `warnings` plutôt qu'affiché) ; aucune vérification n'est
 * faite entre groupes, qui décrivent intentionnellement des dimensionnements
 * différents.
 */
export async function buildComparaisonPptx(groupes: Groupe[]): Promise<ComparaisonResult> {
  let baseZip: Pptx | undefined;
  let totalSlides = 0;
  const groupeResults: GroupeResult[] = [];
  const warnings: string[] = [];

  for (let groupeIndex = 0; groupeIndex < groupes.length; groupeIndex += 1) {
    const groupe = groupes[groupeIndex];
    const scenarioNumero = groupeIndex + 1;
    const cases = orderedCases(groupe);

    let sansValues: SlideValues | undefined;
    let avecValues: StorageSlideValues | undefined;
    const caseResults: CaseResult[] = [];

    for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
      const isGroupeFirstCase = caseIndex === 0;
      const cas = cases[caseIndex];

      let zip: Pptx;
      let caseResult: CaseResult;

      if (cas.scenario === "sans-stockage") {
        const values = await extractSansStockage(cas.pdf, groupe.rangees);
        const rendered = renderSansStockage(values, scenarioNumero);
        zip = rendered.zip;
        sansValues = values;
        caseResult = {
          scenario: cas.scenario,
          values,
          slide1Applied: rendered.slide1Applied,
          slide2Applied: rendered.slide2Applied,
        };
      } else {
        const values = await extractStockage(cas.pdf, groupe.rangees);
        const rendered = await renderStockage(cas.pdf, values, scenarioNumero);
        zip = rendered.zip;
        avecValues = values;
        caseResult = {
          scenario: cas.scenario,
          values,
          slide1Applied: rendered.slide1Applied,
          slide2Applied: rendered.slide2Applied,
          slide3Applied: rendered.slide3Applied,
        };
      }
      caseResults.push(caseResult);

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
        warnings.push(`Avertissement (groupe ${scenarioNumero}) : ${warning}`);
      }
    }

    groupeResults.push({ scenarioNumero, rangees: groupe.rangees, cases: caseResults });
  }

  if (!baseZip) {
    throw new Error("Aucun groupe valide fourni pour le scénario comparaison.");
  }

  return { zip: baseZip, totalSlides, groupes: groupeResults, warnings };
}
