import { describe, expect, it } from "vitest";
import {
  buildStorageValues,
  tauxAutoconsommationAffichage,
  tauxAutoproductionStockage,
} from "../src/calc.js";
import type { StorageExtractedValues } from "../src/types.js";

describe("tauxAutoconsommationAffichage", () => {
  it("caps at '+95' when the total is at or above 95", () => {
    expect(tauxAutoconsommationAffichage(72, 27)).toBe("+95"); // 99
    expect(tauxAutoconsommationAffichage(60, 40)).toBe("+95"); // 100 (arrondi)
    expect(tauxAutoconsommationAffichage(50, 45)).toBe("+95"); // exactement 95
  });

  it("shows the exact value when the total is below 95", () => {
    expect(tauxAutoconsommationAffichage(50, 30)).toBe("80");
  });
});

describe("tauxAutoproductionStockage", () => {
  it("sums PV and storage percentages", () => {
    expect(tauxAutoproductionStockage(38, 14)).toBe(52);
  });
});

describe("buildStorageValues", () => {
  it("assembles installed power and both derived display values from real fixture data", () => {
    const extracted: StorageExtractedValues = {
      nombreModules: 744,
      productionAnnuelleMwh: "343,74",
      ratioDePerformance: "76",
      tauxAutoconsommation: 72,
      surplusProduction: 1,
      tauxAutoproduction: 38,
      productionTotaleMwh: "344,98",
      consommationTotaleMwh: "658,15",
      versBatimentMwh: "247,42",
      versReseauMwh: "3,20",
      depuisPvMwh: "247,42",
      duReseauMwh: "316,11",
      versStockageMwh: "93,88",
      versStockagePct: 27,
      depuisStockageMwh: "91,64",
      depuisStockagePct: 14,
    };

    const values = buildStorageValues(extracted, 3);

    expect(values.puissanceInstallee).toBe(350);
    expect(values.tauxAutoconsommationAffichage).toBe("+95");
    expect(values.tauxAutoproductionStockage).toBe(52);
    expect(values.rangees).toBe(3);
  });
});
