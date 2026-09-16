import { formatProductionKwh, formatRatioPerformance } from "./format.js";
import type { SlideValues } from "../types.js";

/**
 * Correspondances exactes texte-de-run -> texte-de-run pour slide2.xml.
 * Chaque clé doit correspondre mot pour mot au contenu d'un <a:t> du
 * template original (vérifié pendant le planning).
 *
 * Note : le run final "65%" (estimation marketing "avec stockage") n'est
 * volontairement PAS inclus ici — décision utilisateur confirmée, hors
 * périmètre de cette version. Il est signalé séparément par l'appelant
 * (voir cli.ts) plutôt que traité comme un remplacement.
 */
export function buildSlide2Replacements(
  values: SlideValues,
): Map<string, string> {
  const {
    puissanceInstallee,
    nombreModules,
    productionAnnuelleMwh,
    ratioDePerformance,
    tauxAutoconsommation,
    surplusProduction,
    tauxAutoproduction,
  } = values;

  const productionKwh = formatProductionKwh(productionAnnuelleMwh);
  const ratioPerf = formatRatioPerformance(ratioDePerformance);

  return new Map<string, string>([
    [
      "Étude de production – Ombrières 100 kWc sans stockage ",
      `Étude de production – Ombrières ${puissanceInstallee} kWc sans stockage `,
    ],
    ["100 kWc", `${puissanceInstallee} kWc`],
    ["200", `${nombreModules}`],
    ["150 000 kWh", `${productionKwh} kWh`],
    ["80,0 %", `${ratioPerf} %`],
    [
      "Taux d’autoconsommation : 60 %",
      `Taux d’autoconsommation : ${tauxAutoconsommation} %`,
    ],
    [
      "60 % de la production de votre centrale photovoltaïque",
      `${tauxAutoconsommation} % de la production de votre centrale photovoltaïque`,
    ],
    [
      "40 % restants correspondent à un surplus de production",
      `${surplusProduction} % restants correspondent à un surplus de production`,
    ],
    [
      "Taux d’autoproduction : 45 %",
      `Taux d’autoproduction : ${tauxAutoproduction} %`,
    ],
    [
      "45 % de vos besoins en électricité",
      `${tauxAutoproduction} % de vos besoins en électricité`,
    ],
    ["40 % de surplus", `${surplusProduction} % de surplus`],
  ]);
}

/** Textes numériques connus du template que cet outil laisse volontairement inchangés. */
export const SLIDE2_OUT_OF_SCOPE_TEXTS = [
  "65%", // estimation marketing "avec stockage", pas une valeur extraite du PDF
];
