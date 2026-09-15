import type { SlideValues } from "../types.js";

/**
 * Correspondances exactes texte-de-run -> texte-de-run pour slide1.xml.
 * Chaque clé doit correspondre mot pour mot au contenu d'un <a:t> du
 * template original (vérifié pendant le planning).
 */
export function buildSlide1Replacements(
  values: SlideValues,
): Map<string, string> {
  const { puissanceInstallee, rangees } = values;

  return new Map<string, string>([
    [
      "SCENARIO 1 : Ombrières de 350kWc",
      `SCENARIO 1 : Ombrières de ${puissanceInstallee}kWc`,
    ],
    [
      "Ombrières puissance de 350 kWc",
      `Ombrières puissance de ${puissanceInstallee} kWc`,
    ],
    ["350 kWc", `${puissanceInstallee} kWc`],
    [
      "3 rangées d’ombrières photovoltaïques",
      `${rangees} rangées d’ombrières photovoltaïques`,
    ],
    ["3 rangées", `${rangees} rangées`],
  ]);
}
