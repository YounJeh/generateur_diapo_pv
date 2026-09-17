import { loadImage } from "@napi-rs/canvas";
import { getEntryText, setEntryBuffer, setEntryText, type Pptx } from "./zip.js";

const DEFAULT_IMAGE_ENTRY = "ppt/media/image8.png";
const SLIDE2_ENTRY = "ppt/slides/slide2.xml";
const SRC_RECT_PATTERN = /<a:srcRect\b[^/]*\/>/;

const SLIDE3_IMAGE_ENTRY = "ppt/media/image11.png";
const SLIDE3_ENTRY = "ppt/slides/slide3.xml";
const PRESENTATION_ENTRY = "ppt/presentation.xml";
const PIC_BLOCK_PATTERN = /<p:pic>[\s\S]*?<\/p:pic>/;
const OFF_PATTERN = /<a:off\b[^/]*\/>/;
const EXT_PATTERN = /<a:ext\b[^/]*\/>/;
const SLD_SZ_PATTERN = /<p:sldSz\b[^/]*\/>/;
const X_PATTERN = /x="(\d+)"/;
const Y_PATTERN = /y="(\d+)"/;
const CX_PATTERN = /cx="(\d+)"/;
// Haut du bandeau de pied de page bleu marine (`002736`), pleine largeur,
// défini dans le slideMaster (`<a:off y="6419850"/><a:ext cy="438150"/>`,
// et y + cy = hauteur de la diapo). Le bas de l'image doit s'arrêter juste
// au-dessus.
const FOOTER_TOP = 6419850;

function requireAttr(tag: string, pattern: RegExp, label: string, source: string): number {
  const value = tag.match(pattern)?.[1];
  if (value === undefined) {
    throw new Error(
      `Attribut ${label} introuvable dans ${tag} (${source} a peut-être changé).`,
    );
  }
  return Number.parseInt(value, 10);
}

/**
 * Remplace l'image du graphique (slide 2) par `newImageBuffer` et remet
 * `<a:srcRect>` à 0 sur les 4 côtés : l'image d'origine était rognée
 * (b="14310" l="0" r="5625" t="0") pour retirer des éléments d'UI du
 * screenshot original ; la nouvelle image est déjà cadrée proprement en
 * amont (rendu + crop du PDF), donc cet ancien rognage la couperait à tort.
 * La position/taille du cadre (`<a:off>`/`<a:ext>`) n'est pas touchée.
 *
 * `imageEntry` est paramétrable car le template "avec stockage" référence
 * l'image du graphique sous un autre nom (`ppt/media/image5.png`) ; le
 * défaut correspond au template sans-stockage.
 */
export function replaceChartImage(
  zip: Pptx,
  newImageBuffer: Buffer,
  imageEntry: string = DEFAULT_IMAGE_ENTRY,
): void {
  setEntryBuffer(zip, imageEntry, newImageBuffer);

  const xml = getEntryText(zip, SLIDE2_ENTRY);
  if (!SRC_RECT_PATTERN.test(xml)) {
    throw new Error(
      `<a:srcRect> introuvable dans ${SLIDE2_ENTRY} (le template a peut-être changé).`,
    );
  }
  const newXml = xml.replace(
    SRC_RECT_PATTERN,
    '<a:srcRect b="0" l="0" r="0" t="0"/>',
  );
  setEntryText(zip, SLIDE2_ENTRY, newXml);
}

/**
 * Remplace l'image du graphique mensuel (slide 3, scénario avec stockage)
 * par `newImageBuffer`, en ajustant `<a:ext>` (taille) au ratio
 * largeur/hauteur réel de la nouvelle image — contrairement à
 * `replaceChartImage`, cette image ne vise pas le ratio du cadre existant
 * (elle suit le contenu naturel du graphique capturé depuis le PDF) : c'est
 * le cadre qui s'adapte à elle, pas l'inverse.
 *
 * La taille est calculée en "contain" dans l'espace disponible entre la
 * marge d'origine du cadre (`x`, réutilisée comme marge symétrique
 * gauche/droite) et le haut du bandeau de pied de page (`FOOTER_TOP`).
 * `<a:off>` est ensuite recalculé (pas conservé tel quel) pour que l'image
 * reste centrée horizontalement et que son bas touche juste le haut du
 * bandeau, quelle que soit la taille obtenue.
 */
export async function replaceMonthlyChartImage(
  zip: Pptx,
  newImageBuffer: Buffer,
): Promise<void> {
  setEntryBuffer(zip, SLIDE3_IMAGE_ENTRY, newImageBuffer);

  const xml = getEntryText(zip, SLIDE3_ENTRY);
  const picBlock = xml.match(PIC_BLOCK_PATTERN)?.[0];
  if (!picBlock) {
    throw new Error(
      `<p:pic> introuvable dans ${SLIDE3_ENTRY} (le template a peut-être changé).`,
    );
  }
  const off = picBlock.match(OFF_PATTERN)?.[0];
  const ext = picBlock.match(EXT_PATTERN)?.[0];
  if (!off || !ext) {
    throw new Error(
      `<a:off>/<a:ext> introuvable(s) dans le <p:pic> de ${SLIDE3_ENTRY} (le template a peut-être changé).`,
    );
  }
  const marginX = requireAttr(off, X_PATTERN, "x", SLIDE3_ENTRY);
  const topBoundary = requireAttr(off, Y_PATTERN, "y", SLIDE3_ENTRY);

  const sldSz = getEntryText(zip, PRESENTATION_ENTRY).match(SLD_SZ_PATTERN)?.[0];
  if (!sldSz) {
    throw new Error(
      `<p:sldSz> introuvable dans ${PRESENTATION_ENTRY} (le template a peut-être changé).`,
    );
  }
  const slideWidth = requireAttr(sldSz, CX_PATTERN, "cx", PRESENTATION_ENTRY);

  const maxCx = slideWidth - 2 * marginX;
  const maxCy = FOOTER_TOP - topBoundary;

  const image = await loadImage(newImageBuffer);
  const scale = Math.min(maxCx / image.width, maxCy / image.height);
  const cx = Math.round(image.width * scale);
  const cy = Math.round(image.height * scale);
  const newX = Math.round((slideWidth - cx) / 2);
  const newY = FOOTER_TOP - cy;

  const newPicBlock = picBlock
    .replace(off, `<a:off x="${newX}" y="${newY}"/>`)
    .replace(ext, `<a:ext cx="${cx}" cy="${cy}"/>`);
  setEntryText(zip, SLIDE3_ENTRY, xml.replace(picBlock, newPicBlock));
}
