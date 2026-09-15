import { getEntryText, setEntryBuffer, setEntryText, type Pptx } from "./zip.js";

const IMAGE_ENTRY = "ppt/media/image8.png";
const SLIDE2_ENTRY = "ppt/slides/slide2.xml";
const SRC_RECT_PATTERN = /<a:srcRect\b[^/]*\/>/;

/**
 * Remplace l'image du graphique (slide 2) par `newImageBuffer` et remet
 * `<a:srcRect>` à 0 sur les 4 côtés : l'image d'origine était rognée
 * (b="14310" l="0" r="5625" t="0") pour retirer des éléments d'UI du
 * screenshot original ; la nouvelle image est déjà cadrée proprement en
 * amont (rendu + crop du PDF), donc cet ancien rognage la couperait à tort.
 * La position/taille du cadre (`<a:off>`/`<a:ext>`) n'est pas touchée.
 */
export function replaceChartImage(zip: Pptx, newImageBuffer: Buffer): void {
  setEntryBuffer(zip, IMAGE_ENTRY, newImageBuffer);

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
