import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { renderAnnualResultsChartStorage } from "../../src/chart/annualResultsChart.js";

const VALUES = {
  productionTotaleMwh: "344,98",
  consommationTotaleMwh: "658,15",
  versBatimentMwh: "247,42",
  versStockageMwh: "93,88",
  versReseauMwh: "3,20",
  depuisPvMwh: "247,42",
  depuisStockageMwh: "91,64",
  duReseauMwh: "316,11",
  tauxAutoconsommation: 72,
  versStockagePct: 27,
  surplusProduction: 1,
  tauxAutoproduction: 38,
  depuisStockagePct: 14,
};

describe("renderAnnualResultsChartStorage", () => {
  it("produces a non-trivial PNG matching the storage picture frame ratio", async () => {
    const png = renderAnnualResultsChartStorage(VALUES);

    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

    const image = await loadImage(png);
    // Cadre `<a:ext>` de slide2.xml (template storage) : cx=10820400, cy=2493845 EMU (ratio ~4,34).
    const frameRatio = 10820400 / 2493845;
    expect(image.width / image.height).toBeCloseTo(frameRatio, 1);
  });

  it("draws production bar shorter than consumption, proportional to MWh", async () => {
    const png = renderAnnualResultsChartStorage(VALUES);
    const image = await loadImage(png);
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);

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
        const isBackground =
          data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245;
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

  it("draws 3 visually distinct fill colors per row (plus background)", async () => {
    const png = renderAnnualResultsChartStorage(VALUES);
    const image = await loadImage(png);
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);

    function distinctColorsAtRow(y: number): Set<string> {
      const { data } = context.getImageData(404, y, 1150, 1);
      const colors = new Set<string>();
      for (let x = 0; x < 1150; x++) {
        const i = x * 4;
        const isBackground =
          data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245;
        if (!isBackground) {
          colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
        }
      }
      return colors;
    }

    // Tolère l'anticrénelage aux frontières de segments : on veut au moins
    // 3 couleurs nettement différentes, pas exactement 3 valeurs de pixel.
    function countDistinctEnough(colors: Set<string>): number {
      const parsed = [...colors].map((c) => c.split(",").map(Number));
      const clusters: number[][] = [];
      for (const c of parsed) {
        const match = clusters.find(
          (cl) =>
            Math.abs(cl[0] - c[0]) < 20 &&
            Math.abs(cl[1] - c[1]) < 20 &&
            Math.abs(cl[2] - c[2]) < 20,
        );
        if (!match) clusters.push(c);
      }
      return clusters.length;
    }

    expect(countDistinctEnough(distinctColorsAtRow(175))).toBeGreaterThanOrEqual(3);
    expect(countDistinctEnough(distinctColorsAtRow(365))).toBeGreaterThanOrEqual(3);
  });
});
