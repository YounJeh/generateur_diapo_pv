import { mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appendSlides } from "../../src/pptx/mergeSlides.js";
import { getEntryBuffer, getEntryText, openPptx, writePptx } from "../../src/pptx/zip.js";

const SANS_STOCKAGE_FIXTURE = "assets/templates/template-sans-stockage.pptx";
const AVEC_STOCKAGE_FIXTURE = "assets/templates/template-avec-stockage.pptx";
const OUTPUT_DIR = "test/output";

describe("appendSlides", () => {
  it("appends slides 2 and 3 of the storage pptx as slides 3 and 4 of the base pptx", () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = `${OUTPUT_DIR}/merge-slides.pptx`;

    const base = openPptx(SANS_STOCKAGE_FIXTURE);
    const extra = openPptx(AVEC_STOCKAGE_FIXTURE);
    const originalExtraSlide2 = getEntryText(extra, "ppt/slides/slide2.xml");
    const originalExtraSlide3 = getEntryText(extra, "ppt/slides/slide3.xml");
    const originalExtraImage5 = getEntryBuffer(extra, "ppt/media/image5.png");
    const originalExtraImage11 = getEntryBuffer(extra, "ppt/media/image11.png");

    appendSlides(base, extra, [2, 3]);
    writePptx(base, outputPath);

    const output = openPptx(outputPath);

    // Les deux slides d'origine (slide1, slide2 du sans-stockage) restent intactes.
    const originalBase = openPptx(SANS_STOCKAGE_FIXTURE);
    for (const entryName of [
      "ppt/slides/slide1.xml",
      "ppt/slides/slide2.xml",
      "ppt/media/image8.png",
      "ppt/slideLayouts/slideLayout2.xml",
    ]) {
      const original = originalBase.readFile(entryName);
      expect(getEntryBuffer(output, entryName).equals(original!)).toBe(true);
    }

    // Les slides copiées existent sous les nouveaux numéros, contenu inchangé.
    expect(getEntryText(output, "ppt/slides/slide3.xml")).toBe(originalExtraSlide2);
    expect(getEntryText(output, "ppt/slides/slide4.xml")).toBe(originalExtraSlide3);

    // Les médias référencés ont été copiés sous un nom non collisionnant.
    expect(
      getEntryBuffer(output, "ppt/media/slide3-image5.png").equals(originalExtraImage5),
    ).toBe(true);
    expect(
      getEntryBuffer(output, "ppt/media/slide4-image11.png").equals(originalExtraImage11),
    ).toBe(true);

    // Les .rels des nouvelles slides pointent vers le layout partagé et le nouveau média,
    // et ne référencent plus de notesSlide.
    const slide3Rels = getEntryText(output, "ppt/slides/_rels/slide3.xml.rels");
    expect(slide3Rels).toContain('Target="../slideLayouts/slideLayout2.xml"');
    expect(slide3Rels).toContain('Target="../media/slide3-image5.png"');
    expect(slide3Rels).not.toContain("notesSlide");

    const slide4Rels = getEntryText(output, "ppt/slides/_rels/slide4.xml.rels");
    expect(slide4Rels).toContain('Target="../slideLayouts/slideLayout2.xml"');
    expect(slide4Rels).toContain('Target="../media/slide4-image11.png"');
    expect(slide4Rels).not.toContain("notesSlide");

    // [Content_Types].xml déclare les deux nouvelles parts de slide.
    const contentTypes = getEntryText(output, "[Content_Types].xml");
    expect(contentTypes).toContain('PartName="/ppt/slides/slide3.xml"');
    expect(contentTypes).toContain('PartName="/ppt/slides/slide4.xml"');

    // presentation.xml liste 4 slides, avec des id et r:id uniques.
    const presentationXml = getEntryText(output, "ppt/presentation.xml");
    const sldIds = [...presentationXml.matchAll(/<p:sldId id="(\d+)" r:id="([^"]+)"\/>/g)];
    expect(sldIds).toHaveLength(4);
    expect(new Set(sldIds.map((m) => m[1])).size).toBe(4);
    expect(new Set(sldIds.map((m) => m[2])).size).toBe(4);

    // presentation.xml.rels a une relation "slide" par slide, ciblant un fichier existant.
    const presentationRels = getEntryText(output, "ppt/_rels/presentation.xml.rels");
    for (const rid of sldIds.map((m) => m[2])) {
      expect(presentationRels).toContain(`Id="${rid}"`);
    }
    expect(presentationRels).toContain('Target="slides/slide3.xml"');
    expect(presentationRels).toContain('Target="slides/slide4.xml"');
  });
});
