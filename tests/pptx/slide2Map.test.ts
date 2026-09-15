import { describe, expect, it } from "vitest";
import {
  SLIDE2_OUT_OF_SCOPE_TEXTS,
  buildSlide2Replacements,
} from "../../src/pptx/slide2Map.js";
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

describe("buildSlide2Replacements", () => {
  it("has 11 mappings", () => {
    expect(buildSlide2Replacements(values).size).toBe(11);
  });

  it("every key exists verbatim in the real slide2.xml", () => {
    const zip = openPptx(FIXTURE_PPTX);
    const xml = getEntryText(zip, "ppt/slides/slide2.xml");
    const replacements = buildSlide2Replacements(values);

    for (const oldText of replacements.keys()) {
      expect(xml, `clé introuvable dans slide2.xml : "${oldText}"`).toContain(
        `<a:t>${oldText}</a:t>`,
      );
    }
  });

  it("does not include the out-of-scope '52%' text as a key or a value", () => {
    const replacements = buildSlide2Replacements(values);
    for (const [oldText, newText] of replacements) {
      expect(oldText).not.toBe("52%");
      expect(newText).not.toContain("52%");
    }
    expect(SLIDE2_OUT_OF_SCOPE_TEXTS).toContain("52%");
  });

  it("produces the expected replacement text for each field", () => {
    const replacements = buildSlide2Replacements(values);
    expect(replacements.get("744")).toBe("750");
    expect(replacements.get("347 760 kWh")).toBe("350 730 kWh");
    expect(replacements.get("77,0 %")).toBe("77 %");
    expect(replacements.get("Taux d’autoconsommation : 71 %")).toBe(
      "Taux d’autoconsommation : 71 %",
    );
    expect(
      replacements.get(
        "29 % restants correspondent à un surplus de production",
      ),
    ).toBe("29 % restants correspondent à un surplus de production");
    expect(replacements.get("38 % de vos besoins en électricité")).toBe(
      "38 % de vos besoins en électricité",
    );
    expect(replacements.get("29 % de surplus")).toBe("29 % de surplus");
  });
});
