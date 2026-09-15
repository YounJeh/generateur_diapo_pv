import type { ExtractedValues, SlideValues } from "./types.js";

const WC_PAR_MODULE = 470;

/** Puissance installée en kWc = nombre de modules x 470 Wc, arrondie à l'entier supérieur. */
export function puissanceInstallee(nombreModules: number): number {
  return Math.ceil((nombreModules * WC_PAR_MODULE) / 1000);
}

export function buildValues(
  extracted: ExtractedValues,
  rangees: number,
): SlideValues {
  return {
    ...extracted,
    puissanceInstallee: puissanceInstallee(extracted.nombreModules),
    rangees,
  };
}
