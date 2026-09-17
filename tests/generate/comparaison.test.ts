import { describe, expect, it } from "vitest";
import { buildComparaisonPptx, deriveConclusionScenarios } from "../../src/generate/comparaison.js";
import type { Pptx } from "../../src/pptx/zip.js";

const PDF_SANS_STOCKAGE = "test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf";
const PDF_AVEC_STOCKAGE = "test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf";
const PDF_SANS_STOCKAGE_2 = "test/data/D_26_1223_Intermarche_Rixheim_2_Omb_V2.pdf";

describe("buildComparaisonPptx", () => {
  it("assemble un seul groupe (sans-stockage + avec-stockage) en 4 slides", async () => {
    const result = await buildComparaisonPptx([
      { rangees: 3, pdfSansStockage: PDF_SANS_STOCKAGE, pdfAvecStockage: PDF_AVEC_STOCKAGE },
    ]);

    expect(result.totalSlides).toBe(4);
    expect(result.groupes).toHaveLength(1);
    expect(result.groupes[0].cases).toHaveLength(2);
    // Dimensionnements volontairement différents entre les deux fixtures (750 vs 744 modules) : avertissement attendu.
    expect(result.warnings).toHaveLength(2);
    expect(zipSlideCount(result.zip)).toBe(4);
  });

  it("assemble N=2 groupes dynamiques en 6 slides, sans avertissement pour le groupe complet", async () => {
    const result = await buildComparaisonPptx([
      { rangees: 3, pdfSansStockage: PDF_SANS_STOCKAGE, pdfAvecStockage: PDF_AVEC_STOCKAGE },
      { rangees: 2, pdfSansStockage: PDF_SANS_STOCKAGE_2 },
    ]);

    expect(result.totalSlides).toBe(6);
    expect(result.groupes).toHaveLength(2);
    expect(result.groupes[1].cases).toHaveLength(1);
    expect(zipSlideCount(result.zip)).toBe(6);
  });

  it("rejette un tableau de groupes vide", async () => {
    await expect(buildComparaisonPptx([])).rejects.toThrow(/[Aa]ucun groupe/);
  });

  it("deriveConclusionScenarios préfère le cas avec-stockage quand les deux sont présents", async () => {
    const result = await buildComparaisonPptx([
      { rangees: 3, pdfSansStockage: PDF_SANS_STOCKAGE, pdfAvecStockage: PDF_AVEC_STOCKAGE },
      { rangees: 2, pdfSansStockage: PDF_SANS_STOCKAGE_2 },
    ]);

    const scenarios = deriveConclusionScenarios(result.groupes);
    expect(scenarios).toHaveLength(2);
    // Groupe 1 : les deux cas sont fournis -> le cas avec-stockage doit être préféré.
    expect(scenarios[0]).toMatchObject({ scenarioNumero: 1, avecStockage: true });
    // Groupe 2 : seul le cas sans-stockage est fourni.
    expect(scenarios[1]).toMatchObject({ scenarioNumero: 2, avecStockage: false });
  });
});

function zipSlideCount(zip: Pptx): number {
  return zip
    .getEntries()
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName)).length;
}
