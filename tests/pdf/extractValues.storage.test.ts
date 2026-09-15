import { describe, expect, it } from "vitest";
import {
  extractDepuisStockageMwh,
  extractDepuisStockagePct,
  extractFromPdfTextStorage,
  extractVersStockageMwh,
  extractVersStockagePct,
} from "../../src/pdf/extractValues.js";
import { getPageTexts } from "../../src/pdf/reader.js";

const FIXTURE_PDF =
  "test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf";

describe("extractValues (storage)", () => {
  it("extracts the storage-specific fields from the real PDF page 2", async () => {
    const [, page2Text] = await getPageTexts(FIXTURE_PDF, [1, 2]);

    expect(extractVersStockageMwh(page2Text)).toBe("93,88");
    expect(extractVersStockagePct(page2Text)).toBe(27);
    expect(extractDepuisStockageMwh(page2Text)).toBe("91,64");
    expect(extractDepuisStockagePct(page2Text)).toBe(14);
  });

  it("throws an explicit error if the expected pattern is missing", () => {
    expect(() => extractVersStockageMwh("texte sans rapport")).toThrow(
      /MWh vers le stockage/,
    );
    expect(() => extractDepuisStockagePct("texte sans rapport")).toThrow(
      /depuis le stockage/,
    );
  });

  it("extractFromPdfTextStorage combines inherited and storage-specific fields", async () => {
    const [page1Text, page2Text] = await getPageTexts(FIXTURE_PDF, [1, 2]);
    const values = extractFromPdfTextStorage(page1Text, page2Text);

    expect(values).toEqual({
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
    });
  });
});
