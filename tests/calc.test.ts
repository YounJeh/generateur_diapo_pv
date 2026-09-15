import { describe, expect, it } from "vitest";
import { buildValues, puissanceInstallee } from "../src/calc.js";
import type { ExtractedValues } from "../src/types.js";

describe("puissanceInstallee", () => {
  it("matches the original template value for 744 modules (350 kWc)", () => {
    // Sanity check : 744 modules x 470 Wc = 349 680 Wc = 349,68 kWc -> 350,
    // exactement la valeur "350 kWc" du template original.
    expect(puissanceInstallee(744)).toBe(350);
  });

  it("computes and rounds up for the fixture's 750 modules", () => {
    // 750 x 470 = 352 500 Wc = 352,5 kWc -> arrondi supérieur = 353
    expect(puissanceInstallee(750)).toBe(353);
  });

  it("rounds up even when the result is already close to an integer", () => {
    // 100 x 470 = 47 000 Wc = 47 kWc pile -> reste 47 (pas d'arrondi excessif)
    expect(puissanceInstallee(100)).toBe(47);
  });
});

describe("buildValues", () => {
  it("assembles extracted values with the computed power and manual rangees", () => {
    const extracted: ExtractedValues = {
      nombreModules: 750,
      productionAnnuelleMwh: "350,73",
      ratioDePerformance: "77",
      tauxAutoconsommation: 71,
      surplusProduction: 29,
      tauxAutoproduction: 38,
    };

    expect(buildValues(extracted, 3)).toEqual({
      ...extracted,
      puissanceInstallee: 353,
      rangees: 3,
    });
  });
});
