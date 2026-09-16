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
// Espace disponible dans la fixture entre le coin haut-gauche du cadre
// d'origine (<a:off> de slide3.xml) et les bords droit/bas de la diapo
// (<p:sldSz> de presentation.xml) : slideWidth - x = 12192000 - 168275,
// slideHeight - y = 6858000 - 1740280.
const MAX_CX = 12023725;
const MAX_CY = 5117720;

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
  it("fits a tall image inside the available height, capping cy at the slide's bottom edge", async () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = `${OUTPUT_DIR}/replace-monthly-chart-image-tall.pptx`;

    const original = openPptx(FIXTURE_PPTX);
    const zip = openPptx(FIXTURE_PPTX);
    // Ratio 2:1 : plus "haut" que la boîte disponible (MAX_CX/MAX_CY ≈
    // 2.35), donc contrainte par la hauteur. scale = MAX_CY / 400.
    const newImage = dummyPng(800, 400);
    const scale = MAX_CY / 400;

    await replaceMonthlyChartImage(zip, newImage);
    writePptx(zip, outputPath);

    const output = openPptx(outputPath);

    expect(hash(getEntryBuffer(output, "ppt/media/image11.png"))).toBe(
      hash(newImage),
    );

    const slide3Xml = getEntryText(output, "ppt/slides/slide3.xml");
    expect(slide3Xml).toContain('<a:off x="168275" y="1740280"/>');
    expect(slide3Xml).toContain(
      `<a:ext cx="${Math.round(800 * scale)}" cy="${MAX_CY}"/>`,
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

  it("fits a wide image inside the available width, capping cx at the slide's right edge", async () => {
    const zip = openPptx(FIXTURE_PPTX);
    // Ratio 40:1 : bien plus "large" que la boîte disponible, donc
    // contrainte par la largeur. scale = MAX_CX / 4000.
    const newImage = dummyPng(4000, 100);
    const scale = MAX_CX / 4000;

    await replaceMonthlyChartImage(zip, newImage);

    const slide3Xml = getEntryText(zip, "ppt/slides/slide3.xml");
    expect(slide3Xml).toContain(
      `<a:ext cx="${MAX_CX}" cy="${Math.round(100 * scale)}"/>`,
    );
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
