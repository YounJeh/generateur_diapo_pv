import { formatProductionKwh, formatRatioPerformance } from "./format.js";
import type { SlideValues } from "../types.js";

/**
 * Correspondances exactes texte-de-run -> texte-de-run pour slide2.xml.
 * Chaque clé doit correspondre mot pour mot au contenu d'un <a:t> du
 * template original (vérifié pendant le planning).
 *
 * Note : le run final "52%" (estimation marketing "avec stockage") n'est
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
      "Étude de production – Ombrières 350 kWc sans stockage ",
      `Étude de production – Ombrières ${puissanceInstallee} kWc sans stockage `,
    ],
    ["350 kWc", `${puissanceInstallee} kWc`],
    ["744", `${nombreModules}`],
    ["347 760 kWh", `${productionKwh} kWh`],
    ["77,0 %", `${ratioPerf} %`],
    [
      "Taux d’autoconsommation : 71 %",
      `Taux d’autoconsommation : ${tauxAutoconsommation} %`,
    ],
    [
      "71 % de la production de votre centrale photovoltaïque",
      `${tauxAutoconsommation} % de la production de votre centrale photovoltaïque`,
    ],
    [
      "29 % restants correspondent à un surplus de production",
      `${surplusProduction} % restants correspondent à un surplus de production`,
    ],
    [
      "Taux d’autoproduction : 38 %",
      `Taux d’autoproduction : ${tauxAutoproduction} %`,
    ],
    [
      "38 % de vos besoins en électricité",
      `${tauxAutoproduction} % de vos besoins en électricité`,
    ],
    ["29 % de surplus", `${surplusProduction} % de surplus`],
  ]);
}

/** Textes numériques connus du template que cet outil laisse volontairement inchangés. */
export const SLIDE2_OUT_OF_SCOPE_TEXTS = [
  "52%", // estimation marketing "avec stockage", pas une valeur extraite du PDF
];
