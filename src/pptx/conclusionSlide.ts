import { graftSlide } from "./graftSlide.js";
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
 * Réduit/étend la slide de conclusion à `count` blocs "Scénario N"
 * (1 à 3), positionnés/dimensionnés selon `computeBlockRects`, chacun
 * renuméroté. Le bloc "Scénario 1" du template sert de gabarit pour tous
 * les blocs générés (y compris au-delà de 2) — son contenu textuel
 * (autoconsommation/besoins) reste celui du template à ce stade ; le texte
 * réel par scénario est appliqué séparément (voir `setConclusionBlockText`).
 * La bannière de clôture n'est pas touchée ici (position/taille fixes quel
 * que soit `count` — seul son texte change, voir `setClosingBanner`).
 */
export function setConclusionBlockCount(slideXml: string, count: number): string {
  const block1 = extractShapeContaining(slideXml, BLOCK_1_ANCHOR);
  const block2 = extractShapeContaining(slideXml, BLOCK_2_ANCHOR);

  const rects = computeBlockRects(count);
  const blocks = rects.map((rect, index) => {
    const withRect = setShapeRect(block1.shapeXml, rect.x, BLOCK_Y, rect.width, BLOCK_HEIGHT);
    return setScenarioLabel(withRect, index + 1);
  });

  const withoutOriginalBlocks = slideXml
    .replace(block1.shapeXml, "")
    .replace(block2.shapeXml, "");

  if (!withoutOriginalBlocks.includes("</p:spTree>")) {
    throw new Error("</p:spTree> introuvable dans la slide de conclusion.");
  }
  return withoutOriginalBlocks.replace("</p:spTree>", `${blocks.join("")}</p:spTree>`);
}

/** Ajoute la slide de conclusion (contenu par défaut du template) à la fin de `zip`. */
export function addConclusionSlide(zip: Pptx, scenarioCount: number): void {
  const source = openPptx(INTRO_CONCLUSION_TEMPLATE);
  const newSlideNumber = graftSlide(zip, source, CONCLUSION_SLIDE_NUMBER, "append");

  const slidePath = `ppt/slides/slide${newSlideNumber}.xml`;
  const slideXml = getEntryText(zip, slidePath);
  const updatedXml = setConclusionBlockCount(slideXml, scenarioCount);
  setEntryText(zip, slidePath, updatedXml);
}
