import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import express from "express";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { generateRouter } from "../../src/server/routes/generate.js";
import { openPptx } from "../../src/pptx/zip.js";
import { convertPptxToPngs } from "../../src/preview/pptxToImages.js";
import { uploadOutputPptx } from "../../src/server/sessions.js";

vi.mock("../../src/server/sessions.js", async (original) => ({
  ...await original<typeof import("../../src/server/sessions.js")>(),
  readSessionManifest: vi.fn(async () => ({ scenario: "sans-stockage", pdfPathname: "source.pdf", rangees: 3 })),
  downloadPathnameToScratch: vi.fn(async () => "ignored.pdf"),
  uploadOutputPptx: vi.fn(),
  presignDownloadUrl: vi.fn(async () => "https://private.example/output.pptx?signature=test"),
}));
vi.mock("../../src/generate/extract.js", () => ({ extractSansStockage: vi.fn(), extractStockage: vi.fn() }));
vi.mock("../../src/generate/render.js", () => ({
  renderSansStockageStandalone: vi.fn(() => ({ zip: openPptx("assets/templates/template-sans-stockage.pptx") })),
  renderStockageStandalone: vi.fn(),
}));
vi.mock("../../src/preview/pptxToImages.js", () => ({ convertPptxToPngs: vi.fn() }));

let server: Server, base: string;
beforeAll(async () => {
  const app = express();
  app.use(generateRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

it("returns the private PPTX without invoking LibreOffice or generating preview blobs", async () => {
  const response = await fetch(`${base}/generate/${randomUUID()}`, { method: "POST" });
  expect(response.status, await response.clone().text()).toBe(200);
  expect(await response.json()).toEqual({ pptxUrl: "https://private.example/output.pptx?signature=test", previewImageUrls: [] });
  expect(convertPptxToPngs).not.toHaveBeenCalled();
  expect(uploadOutputPptx).toHaveBeenCalledOnce();
  const data = vi.mocked(uploadOutputPptx).mock.calls[0][1];
  expect(data.subarray(0, 2).toString()).toBe("PK");
});
