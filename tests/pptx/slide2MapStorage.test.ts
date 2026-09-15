import { describe, expect, it } from "vitest";
import { buildSlide2ReplacementsStorage } from "../../src/pptx/slide2MapStorage.js";
import { getEntryText, openPptx } from "../../src/pptx/zip.js";
import type { StorageSlideValues } from "../../src/types.js";

const FIXTURE_PPTX =
  "test/data/scenario 1 avec stockage Projet_Ombriere_Rixhiem.pptx";

const values: StorageSlideValues = {
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
  puissanceInstallee: 350,
  rangees: 3,
  tauxAutoconsommationAffichage: "+95",
  tauxAutoproductionStockage: 52,
};

describe("buildSlide2ReplacementsStorage", () => {
  it("has 9 mappings", () => {
    expect(buildSlide2ReplacementsStorage(values).size).toBe(9);
  });

  it("every key exists verbatim in the real storage slide2.xml", () => {
    const zip = openPptx(FIXTURE_PPTX);
    const xml = getEntryText(zip, "ppt/slides/slide2.xml");
    const replacements = buildSlide2ReplacementsStorage(values);

    for (const oldText of replacements.keys()) {
      expect(xml, `clé introuvable dans slide2.xml : "${oldText}"`).toContain(
        `<a:t>${oldText}</a:t>`,
      );
    }
  });

  it("reproduces the template default when the fixture values are already at the cap", () => {
    const replacements = buildSlide2ReplacementsStorage(values);
    expect(replacements.get("Taux d’autoconsommation : +95%")).toBe(
      "Taux d’autoconsommation : +95%",
    );
    expect(
      replacements.get(
        "+95 % de la production de votre centrale photovoltaïque",
      ),
    ).toBe("+95 % de la production de votre centrale photovoltaïque");
    expect(replacements.get("Taux d’autoproduction : 52%")).toBe(
      "Taux d’autoproduction : 52%",
    );
    expect(replacements.get("52 % de vos besoins en électricité")).toBe(
      "52 % de vos besoins en électricité",
    );
  });

  it("does not add a '+' when the autoconsommation is below the cap", () => {
    const belowCap = { ...values, tauxAutoconsommationAffichage: "80" };
    const replacements = buildSlide2ReplacementsStorage(belowCap);
    expect(replacements.get("Taux d’autoconsommation : +95%")).toBe(
      "Taux d’autoconsommation : 80%",
    );
  });

  it("produces the expected replacement text for each field", () => {
    const replacements = buildSlide2ReplacementsStorage(values);
    expect(replacements.get("744")).toBe("744");
    expect(replacements.get("347 760 kWh")).toBe("343 740 kWh");
    expect(replacements.get("77,0 %")).toBe("76 %");
  });

  it("does not mention surplus at all", () => {
    for (const [oldText, newText] of buildSlide2ReplacementsStorage(values)) {
      expect(oldText.toLowerCase()).not.toContain("surplus");
      expect(newText.toLowerCase()).not.toContain("surplus");
    }
  });
});
