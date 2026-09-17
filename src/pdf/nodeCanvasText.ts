import {
  createCanvas,
  DOMMatrix,
  ImageData,
  type Canvas,
  Path2D,
  type SKRSContext2D as CanvasRenderingContext2D,
} from "@napi-rs/canvas";

/** Globaux canvas utilisés par PDF.js, issus du même moteur que le rendu. */
const globalWithCanvasPolyfills = globalThis as {
  DOMMatrix?: typeof DOMMatrix;
  ImageData?: typeof ImageData;
  Path2D?: typeof Path2D;
};
globalWithCanvasPolyfills.DOMMatrix ??= DOMMatrix;
globalWithCanvasPolyfills.ImageData ??= ImageData;
globalWithCanvasPolyfills.Path2D ??= Path2D;

/** Factory commune aux canvas de page et aux canvas internes de PDF.js. */
export class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }

  reset(canvasAndContext: { canvas: Canvas }, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: {
    canvas: Canvas | null;
    context: CanvasRenderingContext2D | null;
  }) {
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}
