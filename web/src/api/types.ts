export type Scenario = "sans-stockage" | "stockage" | "comparaison";
export type TemplateScenario = Extract<Scenario, "sans-stockage" | "stockage">;

export interface SlideValues {
  nombreModules: number;
  productionAnnuelleMwh: string;
  ratioDePerformance: string;
  tauxAutoconsommation: number;
  surplusProduction: number;
  tauxAutoproduction: number;
  productionTotaleMwh: string;
  consommationTotaleMwh: string;
  versBatimentMwh: string;
  versReseauMwh: string;
  depuisPvMwh: string;
  duReseauMwh: string;
  puissanceInstallee: number;
  rangees: number;
}

export interface StorageSlideValues extends SlideValues {
  versStockageMwh: string;
  versStockagePct: number;
  depuisStockageMwh: string;
  depuisStockagePct: number;
  tauxAutoconsommationAffichage: string;
  tauxAutoproductionStockage: number;
}

export interface CaseResult {
  scenario: TemplateScenario;
  values: SlideValues | StorageSlideValues;
}

export interface GroupeResult {
  scenarioNumero: number;
  rangees: number;
  cases: CaseResult[];
}

export type ExtractResponse =
  | { sessionId: string; scenario: TemplateScenario; values: SlideValues | StorageSlideValues }
  | { sessionId: string; scenario: "comparaison"; groupes: GroupeResult[] };

export interface GenerateResponse {
  pptxUrl: string;
}

export interface ApiErrorBody {
  error?: string;
}
