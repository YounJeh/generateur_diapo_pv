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
      "Étude de production – Ombrières 100 kWc avec stockage ",
      `Étude de production – Ombrières ${puissanceInstallee} kWc avec stockage `,
    ],
    ["100 kWc", `${puissanceInstallee} kWc`],
    ["200", `${nombreModules}`],
    ["150 000 kWh", `${productionKwh} kWh`],
    ["80,0 %", `${ratioPerf} %`],
    [
      "Taux d’autoconsommation : +90%",
      `Taux d’autoconsommation : ${tauxAutoconsommationAffichage}%`,
    ],
    [
      "+90 % de la production de votre centrale photovoltaïque",
      `${tauxAutoconsommationAffichage} % de la production de votre centrale photovoltaïque`,
    ],
    [
      "Taux d’autoproduction : 55%",
      `Taux d’autoproduction : ${tauxAutoproductionStockage}%`,
    ],
    [
      "55 % de vos besoins en électricité",
      `${tauxAutoproductionStockage} % de vos besoins en électricité`,
    ],
  ]);
}
