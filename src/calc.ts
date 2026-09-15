import type {
  ExtractedValues,
  SlideValues,
  StorageExtractedValues,
  StorageSlideValues,
} from "./types.js";

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

const AUTOCONSOMMATION_PLANCHER = 95;

/**
 * Taux d'autoconsommation affiché (scénario avec stockage) = %vers-bâtiment
 * + %vers-stockage. Convention marketing : si le total atteint ou dépasse
 * 95 (y compris un dépassement de 100 dû aux arrondis du rapport source),
 * on affiche "+95" plutôt que le nombre exact.
 */
export function tauxAutoconsommationAffichage(
  tauxAutoconsommation: number,
  versStockagePct: number,
): string {
  const total = tauxAutoconsommation + versStockagePct;
  return total >= AUTOCONSOMMATION_PLANCHER ? "+95" : `${total}`;
}

/** Taux d'autoproduction combiné (scénario avec stockage) = %depuis-PV + %depuis-stockage. */
export function tauxAutoproductionStockage(
  tauxAutoproduction: number,
  depuisStockagePct: number,
): number {
  return tauxAutoproduction + depuisStockagePct;
}

export function buildStorageValues(
  extracted: StorageExtractedValues,
  rangees: number,
): StorageSlideValues {
  return {
    ...extracted,
    puissanceInstallee: puissanceInstallee(extracted.nombreModules),
    rangees,
    tauxAutoconsommationAffichage: tauxAutoconsommationAffichage(
      extracted.tauxAutoconsommation,
      extracted.versStockagePct,
    ),
    tauxAutoproductionStockage: tauxAutoproductionStockage(
      extracted.tauxAutoproduction,
      extracted.depuisStockagePct,
    ),
  };
}
