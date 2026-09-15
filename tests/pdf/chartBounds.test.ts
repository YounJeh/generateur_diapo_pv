import { describe, expect, it } from "vitest";
import { openPdfPage } from "../../src/pdf/document.js";
import { findChartBounds } from "../../src/pdf/chartBounds.js";

const FIXTURE_PDF = "test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf";

describe("findChartBounds", () => {
  it("computes a bounding box that covers the chart block without the page header", async () => {
    const page = await openPdfPage(FIXTURE_PDF, 2);
    const bounds = await findChartBounds(page);

    // Le header de page ("RAPPORT DU DESIGNER...") est au-dessus de y=751 ;
    // le graphique doit rester en dessous, avec un peu de marge.
    expect(bounds.y1).toBeLessThan(751);
    expect(bounds.y1).toBeGreaterThan(700);

    // La dernière ligne de légende est à y=582 ; la zone doit s'arrêter
    // juste en dessous, pas au ras du bord de page (y=0).
    expect(bounds.y0).toBeLessThan(582);
    expect(bounds.y0).toBeGreaterThan(500);

    // Largeur : englobe le titre (x=40) jusqu'à la légende la plus large (x+w≈514).
    expect(bounds.x0).toBeLessThan(41);
    expect(bounds.x0).toBeGreaterThan(0);
    expect(bounds.x1).toBeGreaterThan(513);

    expect(bounds.x1).toBeGreaterThan(bounds.x0);
    expect(bounds.y1).toBeGreaterThan(bounds.y0);
  });

  it("throws an explicit error when the top anchor text is missing", async () => {
    const page = await openPdfPage(FIXTURE_PDF, 1); // page 1 n'a pas le graphique
    await expect(findChartBounds(page)).rejects.toThrow(/texte-ancre haut/);
  });
});
