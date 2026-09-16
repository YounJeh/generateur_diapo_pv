import { describe, expect, it } from "vitest";
import { openPdfPage } from "../../src/pdf/document.js";
import { findMonthlyEnergyChartBounds } from "../../src/pdf/monthlyEnergyChartBounds.js";

const FIXTURE_PDF =
  "test/data/D_26_1223_Intermarche_Rixhiem_3_Omb_avec_stockage_V2.pdf";

describe("findMonthlyEnergyChartBounds", () => {
  it("computes a bounding box that covers the chart block without the page header/footer", async () => {
    const page = await openPdfPage(FIXTURE_PDF, 3);
    const bounds = await findMonthlyEnergyChartBounds(page);

    // Le header de page ("RAPPORT DU DESIGNER...", adresse, date) est à
    // partir de y=751 ; le titre du graphique est à y=698, la zone doit
    // rester en dessous du header, avec un peu de marge.
    expect(bounds.y1).toBeLessThan(751);
    expect(bounds.y1).toBeGreaterThan(697);

    // La légende de bas de page ("Energie solaire écrêtée...") est à
    // y=334 ; le bloc "MODULES PV" suivant commence à y=265. La zone doit
    // s'arrêter entre les deux, pas engloutir la section suivante.
    expect(bounds.y0).toBeLessThan(335);
    expect(bounds.y0).toBeGreaterThan(265);

    // Largeur : englobe l'axe/titre (x≈40) jusqu'à la légende la plus large
    // ("Depuis le stockage", x+w≈532).
    expect(bounds.x0).toBeLessThan(41);
    expect(bounds.x0).toBeGreaterThan(0);
    expect(bounds.x1).toBeGreaterThan(532);

    expect(bounds.x1).toBeGreaterThan(bounds.x0);
    expect(bounds.y1).toBeGreaterThan(bounds.y0);
  });

  it("throws an explicit error when the top anchor text is missing", async () => {
    const page = await openPdfPage(FIXTURE_PDF, 1); // page 1 n'a pas le graphique mensuel
    await expect(findMonthlyEnergyChartBounds(page)).rejects.toThrow(
      /texte-ancre haut/,
    );
  });
});
