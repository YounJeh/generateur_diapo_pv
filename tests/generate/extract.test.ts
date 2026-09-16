import { describe, expect, it } from "vitest";
import { extractSansStockage, extractStockage } from "../../src/generate/extract.js";

const FIXTURE_SANS_STOCKAGE = "test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf";
const FIXTURE_STOCKAGE = "test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf";

describe("extractSansStockage", () => {
  it("combine extraction et calcul sur la fixture réelle", async () => {
    const values = await extractSansStockage(FIXTURE_SANS_STOCKAGE, 3);

    expect(values).toEqual({
      nombreModules: 750,
      productionAnnuelleMwh: "350,73",
      ratioDePerformance: "77",
      tauxAutoconsommation: 71,
      surplusProduction: 29,
      tauxAutoproduction: 38,
      productionTotaleMwh: "351,31",
      consommationTotaleMwh: "656,65",
      versBatimentMwh: "249,34",
      versReseauMwh: "101,39",
      depuisPvMwh: "249,34",
      duReseauMwh: "407,31",
      puissanceInstallee: 353,
      rangees: 3,
    });
  });
});

describe("extractStockage", () => {
  it("combine extraction et calcul sur la fixture réelle avec stockage", async () => {
    const values = await extractStockage(FIXTURE_STOCKAGE, 3);

    expect(values.nombreModules).toBe(744);
    expect(values.versStockageMwh).toBe("93,88");
    expect(values.versStockagePct).toBe(27);
    expect(values.depuisStockageMwh).toBe("91,64");
    expect(values.depuisStockagePct).toBe(14);
    expect(values.puissanceInstallee).toBe(350);
    expect(values.tauxAutoconsommationAffichage).toBe("+95");
    expect(values.tauxAutoproductionStockage).toBe(52);
    expect(values.rangees).toBe(3);
  });
});
