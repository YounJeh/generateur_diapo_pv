import { graftSlide } from "./graftSlide.js";
import type { SlideValues, StorageSlideValues } from "../types.js";
import { getEntryText, openPptx, setEntryText, type Pptx } from "./zip.js";

const INTRO_CONCLUSION_TEMPLATE = "assets/templates/template-intro-conclusion.pptx";
const CONCLUSION_SLIDE_NUMBER = 2;

// Enveloppe de contenu commune aux blocs "Scénario N" et à la bannière de
// clôture (mêmes marges que le titre "Conclusion" et la bannière) — voir
// tasks/plan.md pour le détail du calcul EMU.
const CONTENT_MARGIN_X = 685800;
const CONTENT_WIDTH = 10820400;
const BLOCK_GAP = 160000;
const BLOCK_Y = 1635760;
const BLOCK_HEIGHT = 3014240;

const BLOCK_1_ANCHOR = "Scénario 1 ";
const BLOCK_2_ANCHOR = "Scénario 2 ";
const BANNER_ANCHOR = "Les deux solutions sont pertinentes au vu des résultats. ";

const SINGULAR_BANNER_TEXT = "Cette solution est pertinente au vu des résultats. ";
const PLURAL_BANNER_TEXT = "Les solutions présentées sont pertinentes au vu des résultats. ";

/**
 * Données d'un scénario pour la slide de conclusion. `autoconsommationDisplay`
 * reprend la même convention d'affichage que `tauxAutoconsommationAffichage`
 * (src/calc.ts) : soit un nombre en toutes lettres ("60"), soit "+95" pour
 * un taux plafonné — dans ce dernier cas la formulation "Plus de 95 %"
 * (déjà présente dans le template) est utilisée au lieu de "+95 %".
 */
export interface ConclusionScenario {
  scenarioNumero: number;
  avecStockage: boolean;
  autoconsommationDisplay: string;
  besoinsPct: number;
}

interface BlockRect {
  x: number;
  width: number;
}

/**
 * Largeur/position de chaque bloc "Scénario N", N=1..3, dans l'enveloppe de
 * contenu commune (marge 685800, largeur totale 10820400) avec le même
 * espacement inter-blocs que le template d'origine (N=2 : 160000). Le
 * dernier bloc absorbe le reste exact (arrondi EMU) plutôt que de répéter
 * la largeur arrondie, pour que la somme largeurs+espaces colle pile à
 * CONTENT_WIDTH (pas d'écart visible au bord droit).
 */
function computeBlockRects(count: number): BlockRect[] {
  if (count === 1) {
    return [{ x: CONTENT_MARGIN_X, width: CONTENT_WIDTH }];
  }
  const baseWidth = Math.floor((CONTENT_WIDTH - (count - 1) * BLOCK_GAP) / count);
  const rects: BlockRect[] = [];
  let x = CONTENT_MARGIN_X;
  for (let i = 0; i < count; i += 1) {
    const isLast = i === count - 1;
    const width = isLast ? CONTENT_MARGIN_X + CONTENT_WIDTH - x : baseWidth;
    rects.push({ x, width });
    x += width + BLOCK_GAP;
  }
  return rects;
}

interface ExtractedShape {
  shapeXml: string;
}

/** Extrait le `<p:sp>...</p:sp>` englobant un texte de run exact (`<a:t>...</a:t>`). */
function extractShapeContaining(xml: string, anchorText: string): ExtractedShape {
  const needle = `<a:t>${anchorText}</a:t>`;
  const anchorIndex = xml.indexOf(needle);
  if (anchorIndex === -1) {
    throw new Error(`Texte "${anchorText}" introuvable dans la slide de conclusion.`);
  }
  const spStart = xml.lastIndexOf("<p:sp>", anchorIndex);
  const spEndTagIndex = xml.indexOf("</p:sp>", anchorIndex);
  if (spStart === -1 || spEndTagIndex === -1) {
    throw new Error(`<p:sp> englobant "${anchorText}" introuvable dans la slide de conclusion.`);
  }
  const spEnd = spEndTagIndex + "</p:sp>".length;
  return { shapeXml: xml.slice(spStart, spEnd) };
}

function setShapeRect(shapeXml: string, x: number, y: number, cx: number, cy: number): string {
  const pattern = /<a:off x="-?\d+" y="-?\d+"\/><a:ext cx="\d+" cy="\d+"\/>/;
  if (!pattern.test(shapeXml)) {
    throw new Error("<a:off>/<a:ext> introuvable(s) dans le bloc de conclusion (le template a peut-être changé).");
  }
  return shapeXml.replace(pattern, `<a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/>`);
}

function setScenarioLabel(shapeXml: string, scenarioNumero: number): string {
  const pattern = /<a:t>Scénario \d+ <\/a:t>/;
  if (!pattern.test(shapeXml)) {
    throw new Error("Libellé \"Scénario N \" introuvable dans le bloc de conclusion.");
  }
  return shapeXml.replace(pattern, `<a:t>Scénario ${scenarioNumero} </a:t>`);
}

/**
 * Remplace le texte du `<a:t>` d'indice `occurrenceIndex` (0-based, dans
 * l'ordre d'apparition) au sein de `shapeXml`. Utilisé plutôt qu'un
 * remplacement par texte exact (`replaceRuns`) car tous les blocs générés
 * par `setConclusionBlockCount` partagent initialement le même texte
 * (clonés du même gabarit) — un remplacement global écrirait la même
 * valeur dans tous les blocs au lieu d'une valeur propre à chacun.
 */
function replaceNthRunText(shapeXml: string, occurrenceIndex: number, newText: string): string {
  let index = 0;
  let replaced = false;
  const result = shapeXml.replace(/<a:t>[\s\S]*?<\/a:t>/g, (match) => {
    if (index === occurrenceIndex) {
      replaced = true;
      index += 1;
      return `<a:t>${newText}</a:t>`;
    }
    index += 1;
    return match;
  });
  if (!replaced) {
    throw new Error(`Run de texte d'indice ${occurrenceIndex} introuvable dans le bloc de conclusion.`);
  }
  return result;
}

/**
 * Remplit le texte des 2 puces d'un bloc "Scénario N" déjà positionné
 * (voir `setConclusionBlockCount`) : occurrences de `<a:t>` dans l'ordre —
 * 0 = "Scénario N " (déjà posé), 1 = puce 1 gras, 2 = puce 1 suite,
 * 3 = puce 2 gras, 4 = puce 2 suite.
 */
function fillBlockText(shapeXml: string, scenario: ConclusionScenario): string {
  const autoconsommationBold =
    scenario.avecStockage && scenario.autoconsommationDisplay === "+95"
      ? "Plus de 95 % d’autoconsommation"
      : `${scenario.autoconsommationDisplay} % d’autoconsommation`;
  const autoconsommationTail = scenario.avecStockage
    ? " grâce à l’intégration d’une solution de stockage."
    : " de la production photovoltaïque.";
  const besoinsBold = `${scenario.besoinsPct} % des besoins énergétiques du site couverts`;
  const besoinsTail = " par la production photovoltaïque.";

  let xml = shapeXml;
  xml = replaceNthRunText(xml, 1, autoconsommationBold);
  xml = replaceNthRunText(xml, 2, autoconsommationTail);
  xml = replaceNthRunText(xml, 3, besoinsBold);
  xml = replaceNthRunText(xml, 4, besoinsTail);
  return xml;
}

function setClosingBanner(slideXml: string, scenarioCount: number): string {
  const banner = extractShapeContaining(slideXml, BANNER_ANCHOR);
  const text = scenarioCount === 1 ? SINGULAR_BANNER_TEXT : PLURAL_BANNER_TEXT;
  const updatedBanner = banner.shapeXml.replace(`<a:t>${BANNER_ANCHOR}</a:t>`, `<a:t>${text}</a:t>`);
  return slideXml.replace(banner.shapeXml, updatedBanner);
}

/**
 * Reconstruit la slide de conclusion pour `scenarios` (1 à 3 éléments) : un
 * bloc "Scénario N" par élément, positionné/dimensionné selon
 * `computeBlockRects`, avec ses puces autoconsommation/besoins remplies
 * selon `scenario.avecStockage` (formulation + valeurs propres à chaque
 * scénario — voir `fillBlockText`), et la bannière de clôture au singulier
 * ou pluriel selon le nombre de scénarios. Le bloc "Scénario 1" du template
 * sert de gabarit pour tous les blocs générés (y compris au-delà de 2).
 */
export function setConclusionContent(slideXml: string, scenarios: ConclusionScenario[]): string {
  const block1 = extractShapeContaining(slideXml, BLOCK_1_ANCHOR);
  const block2 = extractShapeContaining(slideXml, BLOCK_2_ANCHOR);

  const rects = computeBlockRects(scenarios.length);
  const blocks = scenarios.map((scenario, index) => {
    const rect = rects[index];
    let block = setShapeRect(block1.shapeXml, rect.x, BLOCK_Y, rect.width, BLOCK_HEIGHT);
    block = setScenarioLabel(block, scenario.scenarioNumero);
    block = fillBlockText(block, scenario);
    return block;
  });

  const withoutOriginalBlocks = slideXml
    .replace(block1.shapeXml, "")
    .replace(block2.shapeXml, "");

  if (!withoutOriginalBlocks.includes("</p:spTree>")) {
    throw new Error("</p:spTree> introuvable dans la slide de conclusion.");
  }
  const withNewBlocks = withoutOriginalBlocks.replace(
    "</p:spTree>",
    `${blocks.join("")}</p:spTree>`,
  );

  return setClosingBanner(withNewBlocks, scenarios.length);
}

/** Ajoute la slide de conclusion, remplie pour `scenarios`, à la fin de `zip`. */
export function addConclusionSlide(zip: Pptx, scenarios: ConclusionScenario[]): void {
  const source = openPptx(INTRO_CONCLUSION_TEMPLATE);
  const newSlideNumber = graftSlide(zip, source, CONCLUSION_SLIDE_NUMBER, "append");

  const slidePath = `ppt/slides/slide${newSlideNumber}.xml`;
  const slideXml = getEntryText(zip, slidePath);
  const updatedXml = setConclusionContent(slideXml, scenarios);
  setEntryText(zip, slidePath, updatedXml);
}

/**
 * Dérive un `ConclusionScenario` à partir des valeurs déjà calculées d'un
 * cas (voir `src/calc.ts`) : `StorageSlideValues` (cas avec stockage) porte
 * `tauxAutoconsommationAffichage`/`tauxAutoproductionStockage`, absents de
 * `SlideValues` (cas sans stockage) — la présence de ce champ suffit à
 * distinguer les deux sans paramètre supplémentaire.
 */
export function toConclusionScenario(
  scenarioNumero: number,
  values: SlideValues | StorageSlideValues,
): ConclusionScenario {
  if ("tauxAutoconsommationAffichage" in values) {
    return {
      scenarioNumero,
      avecStockage: true,
      autoconsommationDisplay: values.tauxAutoconsommationAffichage,
      besoinsPct: values.tauxAutoproductionStockage,
    };
  }
  return {
    scenarioNumero,
    avecStockage: false,
    autoconsommationDisplay: `${values.tauxAutoconsommation}`,
    besoinsPct: values.tauxAutoproduction,
  };
}
