import { formatProductionKwh, formatRatioPerformance } from "./format.js";
import type { StorageSlideValues } from "../types.js";

/**
 * Correspondances exactes texte-de-run -> texte-de-run pour slide2.xml du
 * template "avec stockage". Chaque clé doit correspondre mot pour mot au
 * contenu d'un <a:t> du template original (vérifié pendant le planning).
 *
 * Contrairement au template sans stockage, il n'y a pas de run "surplus"
 * ici — la slide ne mentionne que l'autoconsommation et l'autoproduction.
 */
export function buildSlide2ReplacementsStorage(
  values: StorageSlideValues,
): Map<string, string> {
  const {
    puissanceInstallee,
    nombreModules,
    productionAnnuelleMwh,
    ratioDePerformance,
    tauxAutoconsommationAffichage,
    tauxAutoproductionStockage,
  } = values;

  const productionKwh = formatProductionKwh(productionAnnuelleMwh);
  const ratioPerf = formatRatioPerformance(ratioDePerformance);

  return new Map<string, string>([
    [
      "Étude de production – Ombrières 350 kWc avec stockage ",
      `Étude de production – Ombrières ${puissanceInstallee} kWc avec stockage `,
    ],
    ["350 kWc", `${puissanceInstallee} kWc`],
    ["744", `${nombreModules}`],
    ["347 760 kWh", `${productionKwh} kWh`],
    ["77,0 %", `${ratioPerf} %`],
    [
      "Taux d’autoconsommation : +95%",
      `Taux d’autoconsommation : ${tauxAutoconsommationAffichage}%`,
    ],
    [
      "+95 % de la production de votre centrale photovoltaïque",
      `${tauxAutoconsommationAffichage} % de la production de votre centrale photovoltaïque`,
    ],
    [
      "Taux d’autoproduction : 52%",
      `Taux d’autoproduction : ${tauxAutoproductionStockage}%`,
    ],
    [
      "52 % de vos besoins en électricité",
      `${tauxAutoproductionStockage} % de vos besoins en électricité`,
    ],
  ]);
}
