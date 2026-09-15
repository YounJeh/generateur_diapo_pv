/** Valeurs extraites du PDF SolarEdge (pages 1 et 2), telles quelles (pas de reformatage). */
export interface ExtractedValues {
  /** Nombre de modules PV (page 1, ex. "750 Modules PV"). */
  nombreModules: number;
  /** Production d'énergie annuelle en MWh, chaîne source avec virgule (ex. "350,73"). */
  productionAnnuelleMwh: string;
  /** Ratio de performance, chaîne source telle qu'affichée dans le PDF (ex. "77"). */
  ratioDePerformance: string;
  /** Taux d'autoconsommation en % (page 2, "Vers le bâtiment ... (X%)"). */
  tauxAutoconsommation: number;
  /** Surplus de production en % (page 2, "Vers le réseau ... (X%)"). */
  surplusProduction: number;
  /** Taux d'autoproduction en % (page 2, "Depuis le PV ... (X%)"). */
  tauxAutoproduction: number;
  /**
   * Total MWh du graphique "RÉSULTATS DE CONSOMMATION ET DE PRODUCTION
   * ANNUELLES" (page 2, libellé "Production ... MWh"). Distinct de
   * `productionAnnuelleMwh` (page 1, "D'Énergie Annuelle") : les deux
   * valeurs sources diffèrent légèrement dans le rapport (arrondis
   * différents) ; chacune est gardée telle quelle dans son propre contexte.
   */
  productionTotaleMwh: string;
  /** Total MWh consommés (page 2, "Consommation ... MWh"). */
  consommationTotaleMwh: string;
  /** MWh produits envoyés vers le bâtiment (page 2, autoconsommation). */
  versBatimentMwh: string;
  /** MWh produits envoyés vers le réseau (page 2, surplus). */
  versReseauMwh: string;
  /** MWh consommés depuis le PV (page 2, autoproduction). */
  depuisPvMwh: string;
  /** MWh consommés depuis le réseau (page 2). */
  duReseauMwh: string;
}

/**
 * Valeurs complètes utilisées pour remplir le template pptx : les valeurs
 * extraites du PDF, la puissance installée calculée, et le nombre de
 * rangées (non extractible du PDF, fourni manuellement).
 */
export interface SlideValues extends ExtractedValues {
  /** Puissance installée en kWc = nombre de modules x 470, arrondi à l'entier supérieur. */
  puissanceInstallee: number;
  /** Nombre de rangées d'ombrières, fourni manuellement (absent du texte du PDF). */
  rangees: number;
}
