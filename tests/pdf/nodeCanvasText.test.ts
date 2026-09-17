import { createRequire } from "node:module";
import { DOMMatrix, Path2D } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { NodeCanvasFactory } from "../../src/pdf/nodeCanvasText.js";

// PDF.js fournit les globaux et utilise son propre require pour ses canvas.
const require = createRequire(import.meta.url);
const requireFromPdfjs = createRequire(require.resolve("pdfjs-dist/legacy/build/pdf.mjs"));
const pdfjsCanvas = requireFromPdfjs("@napi-rs/canvas") as typeof import("@napi-rs/canvas");

describe("PDF.js canvas compatibility", () => {
  it("uses compatible native paths for clipping and glyph fills", () => {
    expect(pdfjsCanvas.Path2D).toBe(Path2D);
    const { context } = new NodeCanvasFactory().create(20, 20);
    const path = new pdfjsCanvas.Path2D();
    path.rect(0, 0, 10, 10);
    context.clip(path);
    context.fillStyle = "#ff0000";
    context.fill(path);
    expect(Array.from(context.getImageData(5, 5, 1, 1).data)).toEqual([255, 0, 0, 255]);
    expect(context.getImageData(15, 15, 1, 1).data[3]).toBe(0);
  });

  it("applies pattern transforms without suppressing errors", () => {
    const factory = new NodeCanvasFactory();
    const tile = factory.create(20, 20);
    tile.context.fillStyle = "#ff0000";
    tile.context.fillRect(0, 0, 10, 20);
    const { context } = factory.create(40, 20);
    const pattern = context.createPattern(tile.canvas, "repeat")!;
    pattern.setTransform(new DOMMatrix([1, 0, 0, 1, 10, 0]));
    context.fillStyle = pattern;
    context.fillRect(0, 0, 40, 20);
    expect(context.getImageData(5, 5, 1, 1).data[3]).toBe(0);
    expect(Array.from(context.getImageData(15, 5, 1, 1).data)).toEqual([255, 0, 0, 255]);
  });
});
