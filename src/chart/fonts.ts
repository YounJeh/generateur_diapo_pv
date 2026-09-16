import { registerFont } from "canvas";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Polices du template pptx (`typeface="Barlow"` dans les runs de texte natif
 * — voir slide1.xml / slide2.xml). node-canvas ne connaît pas "Barlow" par
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
  registerFont(path.join(FONTS_DIR, "Barlow-Regular.ttf"), {
    family: CHART_FONT_FAMILY,
    weight: "400",
  });
  registerFont(path.join(FONTS_DIR, "Barlow-Italic.ttf"), {
    family: CHART_FONT_FAMILY,
    weight: "400",
    style: "italic",
  });
  registerFont(path.join(FONTS_DIR, "Barlow-SemiBold.ttf"), {
    family: CHART_FONT_FAMILY,
    weight: "600",
  });
  registerFont(path.join(FONTS_DIR, "Barlow-Bold.ttf"), {
    family: CHART_FONT_FAMILY,
    weight: "700",
  });
  registered = true;
}
