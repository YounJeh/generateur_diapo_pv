import { loadImage } from "canvas";
import { getEntryText, setEntryBuffer, setEntryText, type Pptx } from "./zip.js";

const DEFAULT_IMAGE_ENTRY = "ppt/media/image8.png";
const SLIDE2_ENTRY = "ppt/slides/slide2.xml";
const SRC_RECT_PATTERN = /<a:srcRect\b[^/]*\/>/;

const SLIDE3_IMAGE_ENTRY = "ppt/media/image11.png";
const SLIDE3_ENTRY = "ppt/slides/slide3.xml";
const PIC_BLOCK_PATTERN = /<p:pic>[\s\S]*?<\/p:pic>/;
const EXT_PATTERN = /<a:ext\b[^/]*\/>/;
const CX_PATTERN = /cx="(\d+)"/;

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
 * par `newImageBuffer` et ajuste `<a:ext>` (taille du cadre) au ratio
 * largeur/hauteur réel de la nouvelle image, la largeur du cadre d'origine
 * (`cx`) étant conservée à l'identique. Contrairement à `replaceChartImage`,
 * la nouvelle image ici ne vise pas le ratio du cadre existant (elle suit
 * le contenu naturel du graphique capturé depuis le PDF) : c'est le cadre
 * qui s'adapte à elle, pas l'inverse. La position (`<a:off>`) n'est pas
 * touchée.
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
  const ext = picBlock.match(EXT_PATTERN)?.[0];
  const cx = ext ? Number.parseInt(ext.match(CX_PATTERN)?.[1] ?? "", 10) : NaN;
  if (!ext || Number.isNaN(cx)) {
    throw new Error(
      `<a:ext> introuvable ou invalide dans le <p:pic> de ${SLIDE3_ENTRY} (le template a peut-être changé).`,
    );
  }

  const image = await loadImage(newImageBuffer);
  const cy = Math.round((cx * image.height) / image.width);

  const newPicBlock = picBlock.replace(ext, `<a:ext cx="${cx}" cy="${cy}"/>`);
  setEntryText(zip, SLIDE3_ENTRY, xml.replace(picBlock, newPicBlock));
}
