import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadImage } from "@napi-rs/canvas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { convertPptxToPngs } from "../../src/preview/pptxToImages.js";
import { extractSansStockage, extractStockage } from "../../src/generate/extract.js";
import { renderSansStockage, renderStockage } from "../../src/generate/render.js";
import { writePptx } from "../../src/pptx/zip.js";

const PDF_SANS_STOCKAGE = "test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf";
const PDF_AVEC_STOCKAGE = "test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf";

// Vérifié de façon synchrone au moment de la collecte des tests (avant tout
// hook) : describe.skipIf a besoin de connaître la disponibilité de
// LibreOffice avant que les tests ne soient définis, pas après un beforeAll
// asynchrone.
function isLibreOfficeAvailable(): boolean {
  try {
    execFileSync("soffice", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!isLibreOfficeAvailable())("convertPptxToPngs", () => {
  let workDir: string;

  beforeAll(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "pv-preview-test-"));
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("produit 2 PNG lisibles pour le scénario sans-stockage (2 slides)", async () => {
    const values = await extractSansStockage(PDF_SANS_STOCKAGE, 3);
    const { zip } = renderSansStockage(values);
    const pptxPath = path.join(workDir, "sans-stockage.pptx");
    writePptx(zip, pptxPath);

    const pngPaths = await convertPptxToPngs(pptxPath, path.join(workDir, "sans-stockage-out"));

    expect(pngPaths).toHaveLength(2);
    for (const pngPath of pngPaths) {
      const image = await loadImage(pngPath);
      expect(image.width).toBeGreaterThan(0);
      expect(image.height).toBeGreaterThan(0);
    }
  }, 30000);

  it("produit 3 PNG lisibles pour le scénario avec-stockage (3 slides)", async () => {
    const values = await extractStockage(PDF_AVEC_STOCKAGE, 3);
    const { zip } = await renderStockage(PDF_AVEC_STOCKAGE, values);
    const pptxPath = path.join(workDir, "stockage.pptx");
    writePptx(zip, pptxPath);

    const pngPaths = await convertPptxToPngs(pptxPath, path.join(workDir, "stockage-out"));

    expect(pngPaths).toHaveLength(3);
  }, 30000);
});
