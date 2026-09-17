import { mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { graftSlide } from "../../src/pptx/graftSlide.js";
import { getEntryText, listEntryNames, openPptx, writePptx, type Pptx } from "../../src/pptx/zip.js";

const SANS_STOCKAGE_FIXTURE = "assets/templates/template-sans-stockage.pptx";
const INTRO_CONCLUSION_FIXTURE = "assets/templates/template-intro-conclusion.pptx";
const OUTPUT_DIR = "test/output";

/**
 * Vérifie que chaque `PartName` déclaré dans `[Content_Types].xml` (hors
 * quelques parties non-slide sans intérêt ici) correspond bien à une entrée
 * du zip, et que chaque `Target` de `ppt/_rels/presentation.xml.rels`
 * correspond aussi à une entrée existante — la classe de bug la plus
 * probable pour ce genre de fusion inter-templates (référence pendante).
 */
function assertNoDanglingReferences(zip: Pptx): void {
  const entryNames = new Set(listEntryNames(zip));

  const contentTypesXml = getEntryText(zip, "[Content_Types].xml");
  for (const match of contentTypesXml.matchAll(/<Override ContentType="[^"]*" PartName="([^"]+)"/g)) {
    const partName = match[1].replace(/^\//, "");
    expect(entryNames.has(partName), `Content_Types référence ${partName}`).toBe(true);
  }

  const presentationRelsXml = getEntryText(zip, "ppt/_rels/presentation.xml.rels");
  for (const match of presentationRelsXml.matchAll(/Target="([^"]+)"/g)) {
    const target = match[1];
    if (target.startsWith("http")) continue; // relation externe (ex. metadata Google), pas une partie du zip
    expect(entryNames.has(`ppt/${target}`), `presentation.xml.rels référence ${target}`).toBe(true);
  }
}

describe("graftSlide", () => {
  it("prepends the cover slide (foreign layout/master) as the new first slide", () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = `${OUTPUT_DIR}/graft-slide-prepend.pptx`;

    const base = openPptx(SANS_STOCKAGE_FIXTURE);
    const source = openPptx(INTRO_CONCLUSION_FIXTURE);
    const originalSlide1 = getEntryText(base, "ppt/slides/slide1.xml");
    const originalSlide2 = getEntryText(base, "ppt/slides/slide2.xml");

    graftSlide(base, source, 1, "prepend");
    writePptx(base, outputPath);

    const output = openPptx(outputPath);

    const sldIdLst = getEntryText(output, "ppt/presentation.xml").match(
      /<p:sldIdLst>.*?<\/p:sldIdLst>/,
    )?.[0];
    expect(sldIdLst).toBeDefined();
    const slideRids = [...sldIdLst!.matchAll(/r:id="([^"]+)"/g)].map((m) => m[1]);
    expect(slideRids).toHaveLength(3);

    // Le premier sldId du sldIdLst doit pointer vers une nouvelle slide,
    // distincte des 2 slides d'origine (dont le contenu ne doit pas bouger).
    const presentationRels = getEntryText(output, "ppt/_rels/presentation.xml.rels");
    const firstRelTarget = presentationRels.match(
      new RegExp(`Id="${slideRids[0]}"[^>]*Target="([^"]+)"`),
    )?.[1];
    expect(firstRelTarget).toBeDefined();
    expect(firstRelTarget).not.toBe("slides/slide1.xml");
    expect(firstRelTarget).not.toBe("slides/slide2.xml");

    // Les 2 slides de contenu d'origine sont toujours présentes, inchangées.
    expect(getEntryText(output, "ppt/slides/slide1.xml")).toBe(originalSlide1);
    expect(getEntryText(output, "ppt/slides/slide2.xml")).toBe(originalSlide2);

    assertNoDanglingReferences(output);
  });

  it("appends the conclusion slide as the new last slide", () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = `${OUTPUT_DIR}/graft-slide-append.pptx`;

    const base = openPptx(SANS_STOCKAGE_FIXTURE);
    const source = openPptx(INTRO_CONCLUSION_FIXTURE);

    graftSlide(base, source, 2, "append");
    writePptx(base, outputPath);

    const output = openPptx(outputPath);
    const sldIdLst = getEntryText(output, "ppt/presentation.xml").match(
      /<p:sldIdLst>.*?<\/p:sldIdLst>/,
    )?.[0];
    const slideRids = [...sldIdLst!.matchAll(/r:id="([^"]+)"/g)].map((m) => m[1]);
    expect(slideRids).toHaveLength(3);

    const presentationRels = getEntryText(output, "ppt/_rels/presentation.xml.rels");
    const lastRelTarget = presentationRels.match(
      new RegExp(`Id="${slideRids[2]}"[^>]*Target="([^"]+)"`),
    )?.[1];
    expect(lastRelTarget).toBeDefined();
    expect(lastRelTarget).not.toBe("slides/slide1.xml");
    expect(lastRelTarget).not.toBe("slides/slide2.xml");

    assertNoDanglingReferences(output);
  });

  it("grafting both slides in sequence (cover then conclusion) keeps every reference valid", () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = `${OUTPUT_DIR}/graft-slide-both.pptx`;

    const base = openPptx(SANS_STOCKAGE_FIXTURE);
    const source = openPptx(INTRO_CONCLUSION_FIXTURE);

    graftSlide(base, source, 1, "prepend");
    graftSlide(base, source, 2, "append");
    writePptx(base, outputPath);

    const output = openPptx(outputPath);
    const sldIdLst = getEntryText(output, "ppt/presentation.xml").match(
      /<p:sldIdLst>.*?<\/p:sldIdLst>/,
    )?.[0];
    expect([...sldIdLst!.matchAll(/<p:sldId id=/g)]).toHaveLength(4);

    assertNoDanglingReferences(output);
  });
});
