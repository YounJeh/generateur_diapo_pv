import { createCanvas } from "canvas";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { replaceChartImage } from "../../src/pptx/replaceImage.js";
import {
  getEntryBuffer,
  getEntryText,
  openPptx,
  setEntryText,
  writePptx,
} from "../../src/pptx/zip.js";

const FIXTURE_PPTX =
  "test/data/Scenario 1 sans stockage Projet_Ombriere_Rixhiem.pptx";
const OUTPUT_DIR = "test/output";

function hash(buffer: Buffer): string {
  return createHash("md5").update(buffer).digest("hex");
}

function dummyPng(): Buffer {
  const canvas = createCanvas(4, 4);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ff0000";
  context.fillRect(0, 0, 4, 4);
  return canvas.toBuffer("image/png");
}

describe("replaceChartImage", () => {
  it("swaps the image bytes, resets srcRect, and leaves off/ext and everything else untouched", () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = `${OUTPUT_DIR}/replace-image.pptx`;

    const original = openPptx(FIXTURE_PPTX);
    const zip = openPptx(FIXTURE_PPTX);
    const newImage = dummyPng();

    replaceChartImage(zip, newImage);
    writePptx(zip, outputPath);

    const output = openPptx(outputPath);

    expect(hash(getEntryBuffer(output, "ppt/media/image8.png"))).toBe(
      hash(newImage),
    );

    const slide2Xml = getEntryText(output, "ppt/slides/slide2.xml");
    expect(slide2Xml).toContain('<a:srcRect b="0" l="0" r="0" t="0"/>');
    expect(slide2Xml).toContain('<a:off x="671991" y="2596129"/>');
    expect(slide2Xml).toContain('<a:ext cx="10718018" cy="2219711"/>');

    for (const entry of original.getEntries()) {
      if (
        entry.entryName === "ppt/media/image8.png" ||
        entry.entryName === "ppt/slides/slide2.xml"
      ) {
        continue;
      }
      const originalBuffer = original.readFile(entry);
      const outputBuffer = getEntryBuffer(output, entry.entryName);
      expect(hash(outputBuffer)).toBe(hash(originalBuffer!));
    }
  });

  it("throws an explicit error if the srcRect element is missing", () => {
    const zip = openPptx(FIXTURE_PPTX);
    const xml = getEntryText(zip, "ppt/slides/slide2.xml");
    setEntryText(zip, "ppt/slides/slide2.xml", xml.replace(/<a:srcRect[^/]*\/>/, ""));

    expect(() => replaceChartImage(zip, dummyPng())).toThrow(/srcRect/);
  });
});
