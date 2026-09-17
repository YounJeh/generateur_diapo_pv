import { mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addCoverSlide } from "../../src/pptx/coverSlide.js";
import { getEntryText, openPptx, writePptx } from "../../src/pptx/zip.js";

const SANS_STOCKAGE_FIXTURE = "assets/templates/template-sans-stockage.pptx";
const OUTPUT_DIR = "test/output";

describe("addCoverSlide", () => {
  it("prepends the anonymized cover as the new first slide, leaving the rest untouched", () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = `${OUTPUT_DIR}/cover-slide.pptx`;

    const zip = openPptx(SANS_STOCKAGE_FIXTURE);
    const originalSlide1 = getEntryText(zip, "ppt/slides/slide1.xml");
    const originalSlide2 = getEntryText(zip, "ppt/slides/slide2.xml");

    addCoverSlide(zip);
    writePptx(zip, outputPath);

    const output = openPptx(outputPath);
    const sldIdLst = getEntryText(output, "ppt/presentation.xml").match(
      /<p:sldIdLst>.*?<\/p:sldIdLst>/,
    )?.[0];
    expect([...sldIdLst!.matchAll(/<p:sldId id=/g)]).toHaveLength(3);

    // Les 2 slides de contenu d'origine (title + détails) sont inchangées et
    // conservent leur nom de fichier (elles ne sont pas renumérotées).
    expect(getEntryText(output, "ppt/slides/slide1.xml")).toBe(originalSlide1);
    expect(getEntryText(output, "ppt/slides/slide2.xml")).toBe(originalSlide2);
  });
});
