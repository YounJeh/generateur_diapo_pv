import { describe, expect, it } from "vitest";
import { replaceRuns } from "../../src/pptx/replaceText.js";
import { buildSlide1Replacements } from "../../src/pptx/slide1Map.js";
import { buildSlide2Replacements } from "../../src/pptx/slide2Map.js";
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

describe("replaceRuns", () => {
  it("replaces every mapped run in the real slide1.xml", () => {
    const zip = openPptx(FIXTURE_PPTX);
    const xml = getEntryText(zip, "ppt/slides/slide1.xml");
    const replacements = buildSlide1Replacements(values);

    const { xml: newXml, applied } = replaceRuns(xml, replacements);

    expect(applied).toHaveLength(5);
    expect(newXml).toContain("<a:t>SCENARIO 1 : Ombrières de 353kWc</a:t>");
    expect(newXml).toContain("<a:t>Ombrières puissance de 353 kWc</a:t>");
    expect(newXml).toContain("<a:t>353 kWc</a:t>");
    expect(newXml).toContain(
      "<a:t>3 rangées d’ombrières photovoltaïques</a:t>",
    );
    expect(newXml).toContain("<a:t>3 rangées</a:t>");
    expect(newXml).not.toContain("<a:t>350 kWc</a:t>");
    expect(newXml).not.toContain("<a:t>SCENARIO 1 : Ombrières de 350kWc</a:t>");
  });

  it("replaces every mapped run in the real slide2.xml and leaves '52%' untouched", () => {
    const zip = openPptx(FIXTURE_PPTX);
    const xml = getEntryText(zip, "ppt/slides/slide2.xml");
    const replacements = buildSlide2Replacements(values);

    const { xml: newXml, applied } = replaceRuns(xml, replacements);

    expect(applied).toHaveLength(11);
    expect(newXml).toContain("<a:t>750</a:t>");
    expect(newXml).toContain("<a:t>350 730 kWh</a:t>");
    expect(newXml).toContain("<a:t>77 %</a:t>");
    expect(newXml).toContain("<a:t>52%</a:t>"); // hors périmètre, inchangé
  });

  it("throws a clear error listing missing keys, without applying anything", () => {
    const xml = "<a:t>Bonjour</a:t>";
    const replacements = new Map([["Bonjour", "Salut"], ["Absent", "X"]]);

    expect(() => replaceRuns(xml, replacements)).toThrow(/"Absent"/);
  });

  it("never touches a matching substring inside an XML attribute", () => {
    const xml = '<a:ext cx="744992" cy="172357"/><a:t>744</a:t>';
    const replacements = new Map([["744", "750"]]);

    const { xml: newXml } = replaceRuns(xml, replacements);

    expect(newXml).toContain('cx="744992"'); // inchangé
    expect(newXml).toContain("<a:t>750</a:t>"); // remplacé
  });

  it("replaces every occurrence when the same run text appears more than once", () => {
    const xml = "<a:t>350 kWc</a:t><p:sp/><a:t>350 kWc</a:t>";
    const replacements = new Map([["350 kWc", "353 kWc"]]);

    const { xml: newXml } = replaceRuns(xml, replacements);

    expect(newXml.match(/353 kWc/g)).toHaveLength(2);
  });
});
