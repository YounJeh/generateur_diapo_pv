import { describe, expect, it } from "vitest";
import { buildSlide1Replacements } from "../../src/pptx/slide1Map.js";
import { getEntryText, openPptx } from "../../src/pptx/zip.js";
import type { SlideValues } from "../../src/types.js";

const FIXTURE_PPTX =
  "test/data/Scenario 1 sans stockage Projet_Ombriere_Rixhiem.pptx";

const values: SlideValues = {
  nombreModules: 750,
  productionAnnuelleMwh: "350,73",
  ratioDePerformance: "77",
  tauxAutoconsommation: 71,
  surplusProduction: 29,
  tauxAutoproduction: 38,
  puissanceInstallee: 353,
  rangees: 3,
};

describe("buildSlide1Replacements", () => {
  it("has 5 mappings", () => {
    expect(buildSlide1Replacements(values).size).toBe(5);
  });

  it("every key exists verbatim in the real slide1.xml", () => {
    const zip = openPptx(FIXTURE_PPTX);
    const xml = getEntryText(zip, "ppt/slides/slide1.xml");
    const replacements = buildSlide1Replacements(values);

    for (const oldText of replacements.keys()) {
      expect(xml, `clé introuvable dans slide1.xml : "${oldText}"`).toContain(
        `<a:t>${oldText}</a:t>`,
      );
    }
  });

  it("produces the expected replacement text", () => {
    const replacements = buildSlide1Replacements(values);
    expect(replacements.get("350 kWc")).toBe("353 kWc");
    expect(replacements.get("3 rangées")).toBe("3 rangées");
    expect(replacements.get("3 rangées d’ombrières photovoltaïques")).toBe(
      "3 rangées d’ombrières photovoltaïques",
    );
    expect(replacements.get("SCENARIO 1 : Ombrières de 350kWc")).toBe(
      "SCENARIO 1 : Ombrières de 353kWc",
    );
  });

  it("renumbers the SCENARIO label when scenarioNumero is given", () => {
    const replacements = buildSlide1Replacements(values, 2);
    expect(replacements.get("SCENARIO 1 : Ombrières de 350kWc")).toBe(
      "SCENARIO 2 : Ombrières de 353kWc",
    );
  });
});
