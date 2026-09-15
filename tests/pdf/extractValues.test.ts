import { describe, expect, it } from "vitest";
import { getPageTexts } from "../../src/pdf/reader.js";
import {
  extractConsommationTotaleMwh,
  extractDepuisPvMwh,
  extractDuReseauMwh,
  extractFromPdfText,
  extractNombreModules,
  extractProductionAnnuelleMwh,
  extractProductionTotaleMwh,
  extractRatioDePerformance,
  extractSurplusProduction,
  extractTauxAutoconsommation,
  extractTauxAutoproduction,
  extractVersBatimentMwh,
  extractVersReseauMwh,
} from "../../src/pdf/extractValues.js";

const FIXTURE_PDF = "test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf";

describe("extractValues against the real SolarEdge fixture", () => {
  it("extracts all fields with the expected values", async () => {
    const [page1, page2] = await getPageTexts(FIXTURE_PDF, [1, 2]);
    const values = extractFromPdfText(page1, page2);

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
    });
  });

  it("extracts each field individually", async () => {
    const [page1, page2] = await getPageTexts(FIXTURE_PDF, [1, 2]);

    expect(extractNombreModules(page1)).toBe(750);
    expect(extractProductionAnnuelleMwh(page1)).toBe("350,73");
    expect(extractRatioDePerformance(page1)).toBe("77");
    expect(extractTauxAutoconsommation(page2)).toBe(71);
    expect(extractSurplusProduction(page2)).toBe(29);
    expect(extractTauxAutoproduction(page2)).toBe(38);
  });

  it("extracts the absolute MWh breakdown from the annual results chart (page 2)", async () => {
    const [, page2] = await getPageTexts(FIXTURE_PDF, [1, 2]);

    expect(extractProductionTotaleMwh(page2)).toBe("351,31");
    expect(extractConsommationTotaleMwh(page2)).toBe("656,65");
    expect(extractVersBatimentMwh(page2)).toBe("249,34");
    expect(extractVersReseauMwh(page2)).toBe("101,39");
    expect(extractDepuisPvMwh(page2)).toBe("249,34");
    expect(extractDuReseauMwh(page2)).toBe("407,31");
  });
});

describe("extractValues error handling", () => {
  it("throws an explicit error when the expected label is missing", () => {
    expect(() => extractNombreModules("un texte sans rapport")).toThrow(
      /nombre de modules/,
    );
  });

  it("does not match unrelated numbers without the expected label", () => {
    // "du réseau (62%)" ne doit pas être confondu avec "Vers le réseau (29%)"
    const page2 = "Vers le réseau 101,39 MWh (29%) ... du réseau 407,31 MWh (62%)";
    expect(extractSurplusProduction(page2)).toBe(29);
  });
});
