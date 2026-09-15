import { createCanvas, loadImage } from "canvas";
import { describe, expect, it } from "vitest";
import { openPdfPage } from "../../src/pdf/document.js";
import { findChartBounds } from "../../src/pdf/chartBounds.js";
import { renderChartImage } from "../../src/pdf/renderChart.js";

const FIXTURE_PDF = "test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf";

describe("renderChartImage", () => {
  it("produces a non-trivial, correctly-sized PNG of the chart", async () => {
    const page = await openPdfPage(FIXTURE_PDF, 2);
    const bounds = await findChartBounds(page);

    const png = await renderChartImage(FIXTURE_PDF, 2, bounds);

    // Signature PNG
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

    const image = await loadImage(png);
    // La zone fait ~485 x 150 points PDF, rendue à l'échelle x3.
    expect(image.width).toBeGreaterThan(1200);
    expect(image.height).toBeGreaterThan(350);

    // L'image ne doit pas être entièrement blanche (contenu réellement dessiné).
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    let nonWhitePixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) {
        nonWhitePixels++;
      }
    }
    expect(nonWhitePixels).toBeGreaterThan(1000);
  });
});
