import { createCanvas } from "canvas";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { replaceMonthlyChartImage } from "../../src/pptx/replaceImage.js";
import {
  getEntryBuffer,
  getEntryText,
  openPptx,
  setEntryText,
  writePptx,
} from "../../src/pptx/zip.js";

const FIXTURE_PPTX = "test/data/scenario 1 avec stockage Projet_Ombriere_Rixhiem.pptx";
const OUTPUT_DIR = "test/output";
// Cadre d'origine de la slide 3 dans la fixture (`<a:ext>` de slide3.xml).
const ORIGINAL_CX = 12023725;

function hash(buffer: Buffer): string {
  return createHash("md5").update(buffer).digest("hex");
}

function dummyPng(width: number, height: number): Buffer {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#00e77f";
  context.fillRect(0, 0, width, height);
  return canvas.toBuffer("image/png");
}

describe("replaceMonthlyChartImage", () => {
  it("swaps the image bytes and resizes <a:ext> to the new image's ratio, keeping cx and off untouched", async () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = `${OUTPUT_DIR}/replace-monthly-chart-image.pptx`;

    const original = openPptx(FIXTURE_PPTX);
    const zip = openPptx(FIXTURE_PPTX);
    // Ratio 2:1, différent du cadre d'origine (~3.01:1) : la nouvelle
    // hauteur attendue est cx / 2.
    const newImage = dummyPng(800, 400);

    await replaceMonthlyChartImage(zip, newImage);
    writePptx(zip, outputPath);

    const output = openPptx(outputPath);

    expect(hash(getEntryBuffer(output, "ppt/media/image11.png"))).toBe(
      hash(newImage),
    );

    const slide3Xml = getEntryText(output, "ppt/slides/slide3.xml");
    expect(slide3Xml).toContain('<a:off x="168275" y="1740280"/>');
    expect(slide3Xml).toContain(
      `<a:ext cx="${ORIGINAL_CX}" cy="${Math.round(ORIGINAL_CX / 2)}"/>`,
    );

    for (const entry of original.getEntries()) {
      if (
        entry.entryName === "ppt/media/image11.png" ||
        entry.entryName === "ppt/slides/slide3.xml"
      ) {
        continue;
      }
      const originalBuffer = original.readFile(entry);
      const outputBuffer = getEntryBuffer(output, entry.entryName);
      expect(hash(outputBuffer)).toBe(hash(originalBuffer!));
    }
  });

  it("throws an explicit error if the picture element is missing", async () => {
    const zip = openPptx(FIXTURE_PPTX);
    const xml = getEntryText(zip, "ppt/slides/slide3.xml");
    setEntryText(
      zip,
      "ppt/slides/slide3.xml",
      xml.replace(/<p:pic>[\s\S]*?<\/p:pic>/, ""),
    );

    await expect(replaceMonthlyChartImage(zip, dummyPng(8, 4))).rejects.toThrow(
      /p:pic/,
    );
  });
});
