import { describe, expect, it } from "vitest";
import { extractSansStockage, extractStockage } from "../../src/generate/extract.js";
import {
  renderSansStockage,
  renderSansStockageStandalone,
  renderStockage,
  renderStockageStandalone,
} from "../../src/generate/render.js";
import type { Pptx } from "../../src/pptx/zip.js";

const FIXTURE_SANS_STOCKAGE = "test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf";
const FIXTURE_STOCKAGE = "test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf";

function slideCount(zip: Pptx): number {
  return zip
    .getEntries()
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName)).length;
}

describe("renderSansStockage", () => {
  it("applique les valeurs au template et renvoie un pptx à 2 slides", async () => {
    const values = await extractSansStockage(FIXTURE_SANS_STOCKAGE, 3);
    const { zip, slide1Applied, slide2Applied } = renderSansStockage(values);

    expect(slide1Applied).toBeGreaterThan(0);
    expect(slide2Applied).toBeGreaterThan(0);
    expect(zip.getEntry("ppt/slides/slide1.xml")).not.toBeNull();
    expect(zip.getEntry("ppt/slides/slide2.xml")).not.toBeNull();
    expect(zip.getEntry("ppt/slides/slide3.xml")).toBeNull();
  });
});

describe("renderStockage", () => {
  it("applique les valeurs au template et renvoie un pptx à 3 slides", async () => {
    const values = await extractStockage(FIXTURE_STOCKAGE, 3);
    const { zip, slide1Applied, slide2Applied, slide3Applied } = await renderStockage(
      FIXTURE_STOCKAGE,
      values,
    );

    expect(slide1Applied).toBeGreaterThan(0);
    expect(slide2Applied).toBeGreaterThan(0);
    expect(slide3Applied).toBeGreaterThan(0);
    expect(zip.getEntry("ppt/slides/slide1.xml")).not.toBeNull();
    expect(zip.getEntry("ppt/slides/slide2.xml")).not.toBeNull();
    expect(zip.getEntry("ppt/slides/slide3.xml")).not.toBeNull();
  });
});

describe("renderSansStockageStandalone", () => {
  it("ajoute la couverture et la conclusion autour des 2 slides de contenu", async () => {
    const values = await extractSansStockage(FIXTURE_SANS_STOCKAGE, 3);
    const { zip } = renderSansStockageStandalone(values);

    // 2 slides de contenu (inchangées, mêmes noms de fichier) + couverture + conclusion.
    expect(slideCount(zip)).toBe(4);
    expect(zip.getEntry("ppt/slides/slide1.xml")).not.toBeNull();
    expect(zip.getEntry("ppt/slides/slide2.xml")).not.toBeNull();
  });
});

describe("renderStockageStandalone", () => {
  it("ajoute la couverture et la conclusion autour des 3 slides de contenu", async () => {
    const values = await extractStockage(FIXTURE_STOCKAGE, 3);
    const { zip } = await renderStockageStandalone(FIXTURE_STOCKAGE, values);

    expect(slideCount(zip)).toBe(5);
    expect(zip.getEntry("ppt/slides/slide1.xml")).not.toBeNull();
    expect(zip.getEntry("ppt/slides/slide2.xml")).not.toBeNull();
    expect(zip.getEntry("ppt/slides/slide3.xml")).not.toBeNull();
  });
});
