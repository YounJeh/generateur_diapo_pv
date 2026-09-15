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
