import { getEntryText, setEntryBuffer, setEntryText, type Pptx } from "./zip.js";

const DEFAULT_IMAGE_ENTRY = "ppt/media/image8.png";
const SLIDE2_ENTRY = "ppt/slides/slide2.xml";
const SRC_RECT_PATTERN = /<a:srcRect\b[^/]*\/>/;

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
