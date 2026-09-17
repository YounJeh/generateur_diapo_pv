import { GlobalFonts } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Polices du template pptx (`typeface="Barlow"` dans les runs de texte natif
 * — voir slide1.xml / slide2.xml). Le moteur canvas ne connaît pas "Barlow" par
 * défaut (police non installée sur le système), d'où l'enregistrement
 * explicite des fichiers .ttf pour que le texte dessiné sur les graphiques
 * (image PNG insérée dans le pptx) utilise la même police que le reste de la
 * slide plutôt qu'un fallback silencieux.
 */
const FONTS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "assets",
  "fonts",
  "Barlow",
);

export const CHART_FONT_FAMILY = "Barlow";

let registered = false;

export function ensureChartFontsRegistered(): void {
  if (registered) {
    return;
  }
  for (const filename of [
    "Barlow-Regular.ttf",
    "Barlow-Italic.ttf",
    "Barlow-SemiBold.ttf",
    "Barlow-Bold.ttf",
  ]) {
    if (!GlobalFonts.registerFromPath(path.join(FONTS_DIR, filename), CHART_FONT_FAMILY)) {
      throw new Error(`Impossible de charger la police ${filename}.`);
    }
  }
  registered = true;
}
