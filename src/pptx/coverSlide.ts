import { fileURLToPath } from "node:url";
import path from "node:path";
import { graftSlide } from "./graftSlide.js";
import { openPptx, type Pptx } from "./zip.js";

// Résolu par rapport à ce module, pas à `process.cwd()` (même classe de bug
// que TEMPLATE_PPTX, voir generate/types.ts — sur Vercel, le répertoire de
// travail courant d'une fonction serverless ne correspond pas forcément à la
// racine du bundle).
/** Asset source des slides de couverture (slide 1) et de conclusion (slide 2, voir conclusionSlide.ts). */
export const INTRO_CONCLUSION_TEMPLATE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "assets",
  "templates",
  "template-intro-conclusion.pptx",
);
const COVER_SLIDE_NUMBER = 1;

/**
 * Ajoute la slide de couverture (logo client déjà anonymisé dans l'asset,
 * voir `template-intro-conclusion.pptx`) en tête de `zip`. Aucun texte/image
 * à substituer au moment de l'appel : l'asset est déjà le contenu final.
 */
export function addCoverSlide(zip: Pptx): void {
  const source = openPptx(INTRO_CONCLUSION_TEMPLATE);
  graftSlide(zip, source, COVER_SLIDE_NUMBER, "prepend");
}
