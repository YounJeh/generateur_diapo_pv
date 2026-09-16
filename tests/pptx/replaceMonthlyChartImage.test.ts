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

const FIXTURE_PPTX = "assets/templates/template-avec-stockage.pptx";
const OUTPUT_DIR = "test/output";
// Dérivés des constantes de la fixture (slideWidth=12192000, marginX (x
// d'origine)=168275, topBoundary (y d'origine)=1740280, FOOTER_TOP=6419850) :
// maxCx = slideWidth - 2*marginX, maxCy = FOOTER_TOP - topBoundary.
const MAX_CX = 11855450;
const MAX_CY = 4679570;
const SLIDE_WIDTH = 12192000;
const FOOTER_TOP = 6419850;

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
  it("fits a tall image inside the available height, centers it and rests its bottom on the footer", async () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = `${OUTPUT_DIR}/replace-monthly-chart-image-tall.pptx`;

    const original = openPptx(FIXTURE_PPTX);
    const zip = openPptx(FIXTURE_PPTX);
    // Ratio 2:1 : plus "haut" que la boîte disponible (MAX_CX/MAX_CY ≈
    // 2.53), donc contrainte par la hauteur. scale = MAX_CY / 400.
    const newImage = dummyPng(800, 400);
    const scale = MAX_CY / 400;
    const cx = Math.round(800 * scale);

    await replaceMonthlyChartImage(zip, newImage);
    writePptx(zip, outputPath);

    const output = openPptx(outputPath);

    expect(hash(getEntryBuffer(output, "ppt/media/image11.png"))).toBe(
      hash(newImage),
    );

    const slide3Xml = getEntryText(output, "ppt/slides/slide3.xml");
    expect(slide3Xml).toContain(`<a:ext cx="${cx}" cy="${MAX_CY}"/>`);
    // Centré horizontalement ; bas de l'image = FOOTER_TOP (juste au-dessus
    // du bandeau).
    expect(slide3Xml).toContain(
      `<a:off x="${Math.round((SLIDE_WIDTH - cx) / 2)}" y="${FOOTER_TOP - MAX_CY}"/>`,
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

  it("fits a wide image inside the available width, centers it and rests its bottom on the footer", async () => {
    const zip = openPptx(FIXTURE_PPTX);
    // Ratio 40:1 : bien plus "large" que la boîte disponible, donc
    // contrainte par la largeur. scale = MAX_CX / 4000.
    const newImage = dummyPng(4000, 100);
    const scale = MAX_CX / 4000;
    const cy = Math.round(100 * scale);

    await replaceMonthlyChartImage(zip, newImage);

    const slide3Xml = getEntryText(zip, "ppt/slides/slide3.xml");
    expect(slide3Xml).toContain(`<a:ext cx="${MAX_CX}" cy="${cy}"/>`);
    expect(slide3Xml).toContain(
      `<a:off x="${Math.round((SLIDE_WIDTH - MAX_CX) / 2)}" y="${FOOTER_TOP - cy}"/>`,
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
