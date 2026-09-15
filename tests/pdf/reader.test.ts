import { describe, expect, it } from "vitest";
import { getPageTexts } from "../../src/pdf/reader.js";

const FIXTURE_PDF =
  "test/data/Solar_Edge_ITM_Rixhiem_3_omb_V2.pdf";

describe("getPageTexts", () => {
  it("returns the text of the requested pages only, in order", async () => {
    const [page1, page2] = await getPageTexts(FIXTURE_PDF, [1, 2]);

    expect(page1).toContain("750");
    expect(page1).toContain("Modules PV");
    expect(page2).toContain("RÉSULTATS DE CONSOMMATION ET DE PRODUCTION ANNUELLES");
  });
});
