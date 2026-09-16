import type { Scenario } from "../api/types";

export interface GroupeFormState {
  /** Clé locale stable pour le rendu de liste React, jamais envoyée au serveur. */
  id: string;
  rangees: number;
  pdfSansStockage: File | null;
  pdfAvecStockage: File | null;
}

export interface FormState {
  scenario: Scenario;
  // Scénarios "sans-stockage" / "stockage"
  pdf: File | null;
  rangees: number;
  // Scénario "comparaison"
  groupes: GroupeFormState[];
}

let nextGroupeId = 1;

export function createGroupe(): GroupeFormState {
  return {
    id: `groupe-${nextGroupeId++}`,
    rangees: 3,
    pdfSansStockage: null,
    pdfAvecStockage: null,
  };
}

export function createInitialFormState(): FormState {
  return {
    scenario: "sans-stockage",
    pdf: null,
    rangees: 3,
    groupes: [createGroupe()],
  };
}

/** Un cas fournit au moins un PDF (le nombre de rangées a toujours une valeur par défaut valide). */
function groupeHasAtLeastOnePdf(groupe: GroupeFormState): boolean {
  return groupe.pdfSansStockage !== null || groupe.pdfAvecStockage !== null;
}

export function isFormValid(form: FormState): boolean {
  if (form.scenario === "comparaison") {
    return (
      form.groupes.length > 0 &&
      form.groupes.every((g) => g.rangees > 0 && groupeHasAtLeastOnePdf(g))
    );
  }
  return form.pdf !== null && form.rangees > 0;
}

export function buildExtractFormData(form: FormState): FormData {
  const data = new FormData();
  data.set("scenario", form.scenario);

  if (form.scenario === "comparaison") {
    form.groupes.forEach((groupe, index) => {
      const n = index + 1;
      data.set(`groupe-${n}-rangees`, String(groupe.rangees));
      if (groupe.pdfSansStockage) {
        data.set(`groupe-${n}-pdf-sans-stockage`, groupe.pdfSansStockage);
      }
      if (groupe.pdfAvecStockage) {
        data.set(`groupe-${n}-pdf-avec-stockage`, groupe.pdfAvecStockage);
      }
    });
    return data;
  }

  data.set("rangees", String(form.rangees));
  if (form.pdf) {
    data.set("pdf", form.pdf);
  }
  return data;
}
