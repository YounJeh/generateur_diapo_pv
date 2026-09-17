import { fileURLToPath } from "node:url";
import path from "node:path";

export type Scenario = "sans-stockage" | "stockage" | "comparaison";
/** Scénarios adossés à un unique template pptx (à l'exclusion de "comparaison", qui combine les deux). */
export type TemplateScenario = Extract<Scenario, "sans-stockage" | "stockage">;

export const SCENARIOS: readonly Scenario[] = ["sans-stockage", "stockage", "comparaison"];

// Chemin résolu par rapport à ce module (comme chart/fonts.ts), pas à
// `process.cwd()` : sur Vercel, le répertoire de travail courant d'une
// fonction serverless ne correspond pas forcément à la racine du bundle
// (constaté en déploiement réel : "ADM-ZIP: Invalid filename" à l'ouverture
// du template, le chemin relatif ne pointant vers rien).
const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");

export const TEMPLATE_PPTX: Record<TemplateScenario, string> = {
  "sans-stockage": path.join(ASSETS_DIR, "templates", "template-sans-stockage.pptx"),
  stockage: path.join(ASSETS_DIR, "templates", "template-avec-stockage.pptx"),
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
