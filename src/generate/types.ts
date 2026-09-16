export type Scenario = "sans-stockage" | "stockage" | "comparaison";
/** Scénarios adossés à un unique template pptx (à l'exclusion de "comparaison", qui combine les deux). */
export type TemplateScenario = Extract<Scenario, "sans-stockage" | "stockage">;

export const SCENARIOS: readonly Scenario[] = ["sans-stockage", "stockage", "comparaison"];

export const TEMPLATE_PPTX: Record<TemplateScenario, string> = {
  "sans-stockage": "assets/templates/template-sans-stockage.pptx",
  stockage: "assets/templates/template-avec-stockage.pptx",
};

/**
 * Groupe de dimensionnement pour le scénario "comparaison" : un nombre de
 * rangées (donc une puissance) donné, avec un cas sans-stockage et/ou un cas
 * avec-stockage. Deux PDF appartiennent au même groupe s'ils décrivent le
 * même dimensionnement physique (mêmes ombrières/puissance).
 */
export interface Groupe {
  rangees: number;
  pdfSansStockage?: string;
  pdfAvecStockage?: string;
}
