import { createCanvas, loadImage } from "canvas";
import { describe, expect, it } from "vitest";
import { renderAnnualResultsChart } from "../../src/chart/annualResultsChart.js";

const VALUES = {
  productionTotaleMwh: "351,31",
  consommationTotaleMwh: "656,65",
  versBatimentMwh: "249,34",
  versReseauMwh: "101,39",
  depuisPvMwh: "249,34",
  duReseauMwh: "407,31",
  tauxAutoconsommation: 71,
  surplusProduction: 29,
  tauxAutoproduction: 38,
};

describe("renderAnnualResultsChart", () => {
  it("produces a non-trivial PNG matching the slide's picture frame ratio", async () => {
    const png = renderAnnualResultsChart(VALUES);

    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

    const image = await loadImage(png);
    // Cadre `<a:ext>` de slide2.xml : cx=10718018, cy=2219711 EMU (ratio ~4,83).
    const frameRatio = 10718018 / 2219711;
    expect(image.width / image.height).toBeCloseTo(frameRatio, 1);

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

  it("draws the production bar shorter than consumption, proportional to MWh", async () => {
    // Production (351,31 MWh) doit occuper une largeur de barre plus courte
    // que Consommation (656,65 MWh) puisque la longueur encode le MWh.
    const png = renderAnnualResultsChart(VALUES);
    const image = await loadImage(png);
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);

    // Bornes horizontales des barres dans le module (barX .. barX + barMaxW) :
    // on limite le scan à cette plage pour ne jamais atteindre la légende.
    const BAR_X_START = 404;
    const BAR_X_END = 404 + 1150;

    function barWidthAtRow(y: number): number {
      const { data } = context.getImageData(
        BAR_X_START,
        y,
        BAR_X_END - BAR_X_START,
        1,
      );
      let firstFilled = -1;
      let lastFilled = -1;
      for (let x = 0; x < BAR_X_END - BAR_X_START; x++) {
        const i = x * 4;
        // Fond quasi-blanc (#fcfcfb) : on ne compte que les pixels nettement
        // plus sombres/saturés (le remplissage de la barre) comme "rempli".
        const isBackground = data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245;
        if (!isBackground) {
          if (firstFilled === -1) firstFilled = x;
          lastFilled = x;
        }
      }
      return lastFilled - firstFilled;
    }

    const productionBarWidth = barWidthAtRow(175);
    const consommationBarWidth = barWidthAtRow(365);
    expect(productionBarWidth).toBeLessThan(consommationBarWidth);
  });
});
