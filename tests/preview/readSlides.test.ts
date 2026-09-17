import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readSlides } from "../../web/src/preview/readSlides";
import { extractSansStockage, extractStockage } from "../../src/generate/extract.js";
import { renderSansStockageStandalone, renderStockageStandalone } from "../../src/generate/render.js";
import { buildComparaisonPptx } from "../../src/generate/comparaison.js";
import { writePptx, type Pptx } from "../../src/pptx/zip.js";

// Keep Node typed arrays for AdmZip; only XML parsing needs a browser API.
vi.stubGlobal("DOMParser", new JSDOM().window.DOMParser);

const createUrl = vi.fn(() => `blob:preview-${Math.random()}`);
const revokeUrl = vi.fn();
vi.stubGlobal("URL", Object.assign(globalThis.URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
afterEach(() => vi.clearAllMocks());

function fixture(name: string) {
  return Uint8Array.from(readFileSync(`assets/templates/${name}.pptx`)).buffer;
}

describe("cover preview", () => {
  it("preserves the slide size, blue background and cropped layout images", () => {
    const preview = readSlides(fixture("template-intro-conclusion"));
    const cover = preview.slides[0];
    expect(cover.width / cover.height).toBeCloseTo(16 / 9);
    expect(cover.background).toBe("#005374");
    expect(cover.elements.filter((element) => element.image)).toHaveLength(7);
    expect(cover.elements.some((element) => element.image?.style.width !== "100%")).toBe(true);
    const count = createUrl.mock.calls.length;
    preview.dispose();
    expect(revokeUrl).toHaveBeenCalledTimes(count);
  });

  it("inherits Barlow title styling and keeps production values and image layering", () => {
    const preview = readSlides(fixture("template-sans-stockage"));
    const slide = preview.slides[0];
    const title = slide.elements.find((element) => element.paragraphs?.some((p) => p.runs.some((r) => r.text.startsWith("SCENARIO"))));
    expect(title?.paragraphs?.[0].style).toMatchObject({ fontFamily: "Barlow", fontSize: 28, color: "#C3D200" });
    const text = slide.elements.flatMap((element) => element.paragraphs?.flatMap((p) => p.runs.map((r) => r.text)) ?? []).join(" ");
    expect(text).toContain("2 rangées");
    expect(slide.elements.filter((element) => element.image)).toHaveLength(3);
    expect(slide.elements.some((element) => element.style.background === "#002736")).toBe(true);
    preview.dispose();
  });
});

function generatedPreview(zip: Pptx) {
  const directory = mkdtempSync(path.join(tmpdir(), "pv-html-preview-"));
  try {
    const file = path.join(directory, "generated.pptx");
    writePptx(zip, file);
    return readSlides(Uint8Array.from(readFileSync(file)).buffer);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const sans = "test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf";
const stockage = "test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf";
const slideText = (slide: ReturnType<typeof readSlides>["slides"][number]) => slide.elements.flatMap((element) =>
  element.paragraphs?.flatMap((p) => p.runs.map((run) => run.text)) ?? []).join("");

describe("generated slide previews", () => {
  it("reads the final order and actual values for a standalone presentation", async () => {
    const values = await extractSansStockage(sans, 3);
    const preview = generatedPreview(renderSansStockageStandalone(values).zip);
    expect(preview.slides).toHaveLength(4);
    expect(slideText(preview.slides[1])).toContain("3 rangées");
    expect(slideText(preview.slides[2])).toContain(String(values.nombreModules));
    expect(slideText(preview.slides[3])).toContain("Conclusion");
    expect(slideText(preview.slides[3])).toContain(`${values.tauxAutoproduction} %`);
    preview.dispose();
  });

  it("includes the generated monthly PNG for storage", async () => {
    const values = await extractStockage(stockage, 3);
    const preview = generatedPreview((await renderStockageStandalone(stockage, values)).zip);
    expect(preview.slides).toHaveLength(5);
    expect(slideText(preview.slides[2])).toContain("+95");
    expect(preview.slides[3].elements.filter((element) => element.image)).toHaveLength(2);
    expect(slideText(preview.slides[4])).toContain("Plus de 95 %");
    preview.dispose();
  }, 15000);

  it("resolves renamed relationships and all groups after comparison assembly", async () => {
    const result = await buildComparaisonPptx([
      { rangees: 3, pdfSansStockage: sans, pdfAvecStockage: stockage },
      { rangees: 2, pdfSansStockage: "test/data/D_26_1223_Intermarche_Rixheim_2_Omb_V2.pdf" },
    ]);
    const preview = generatedPreview(result.zip);
    expect(preview.slides).toHaveLength(8);
    expect(slideText(preview.slides[5])).toContain("SCENARIO 2");
    expect(slideText(preview.slides[7])).toContain("Scénario 2");
    expect(preview.slides.every((slide) => slide.elements.some((element) => element.image))).toBe(true);
    preview.dispose();
  }, 15000);
});
