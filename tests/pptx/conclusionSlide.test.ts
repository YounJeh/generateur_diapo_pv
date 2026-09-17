import { mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addConclusionSlide, type ConclusionScenario } from "../../src/pptx/conclusionSlide.js";
import { getEntryText, openPptx, writePptx } from "../../src/pptx/zip.js";

const SANS_STOCKAGE_FIXTURE = "assets/templates/template-sans-stockage.pptx";
const OUTPUT_DIR = "test/output";

function lastSlideXml(zip: ReturnType<typeof openPptx>): string {
  const sldIdLst = getEntryText(zip, "ppt/presentation.xml").match(
    /<p:sldIdLst>.*?<\/p:sldIdLst>/,
  )?.[0];
  const rids = [...sldIdLst!.matchAll(/r:id="([^"]+)"/g)].map((m) => m[1]);
  const lastRid = rids[rids.length - 1];
  const rels = getEntryText(zip, "ppt/_rels/presentation.xml.rels");
  const target = rels.match(new RegExp(`Id="${lastRid}"[^>]*Target="([^"]+)"`))?.[1];
  return getEntryText(zip, `ppt/${target}`);
}

function blockRects(
  slideXml: string,
): Array<{ x: number; width: number; scenarioNumero: number }> {
  return [...slideXml.matchAll(/Scénario (\d) <\/a:t>/g)].map((match) => {
    const scenarioNumero = match[1];
    const before = slideXml.slice(0, match.index);
    const spStart = before.lastIndexOf("<p:sp>");
    const shapeXml = slideXml.slice(spStart, slideXml.indexOf("</p:sp>", match.index));
    const rect = shapeXml.match(/<a:off x="(-?\d+)" y="-?\d+"\/><a:ext cx="(\d+)" cy="\d+"\/>/);
    return { x: Number(rect![1]), width: Number(rect![2]), scenarioNumero: Number(scenarioNumero) };
  });
}

function buildAndRender(scenarios: ConclusionScenario[], name: string): string {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const zip = openPptx(SANS_STOCKAGE_FIXTURE);
  addConclusionSlide(zip, scenarios);
  const outputPath = `${OUTPUT_DIR}/${name}.pptx`;
  writePptx(zip, outputPath);
  return lastSlideXml(openPptx(outputPath));
}

describe("addConclusionSlide", () => {
  it("N=1 produces a single full-width block", () => {
    const slideXml = buildAndRender(
      [{ scenarioNumero: 1, avecStockage: false, autoconsommationDisplay: "60", besoinsPct: 45 }],
      "conclusion-n1",
    );
    const rects = blockRects(slideXml);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toMatchObject({ x: 685800, width: 10820400 });
  });

  it("N=2 matches the template's own two-block layout", () => {
    const slideXml = buildAndRender(
      [
        { scenarioNumero: 1, avecStockage: true, autoconsommationDisplay: "+95", besoinsPct: 52 },
        { scenarioNumero: 2, avecStockage: false, autoconsommationDisplay: "90", besoinsPct: 29 },
      ],
      "conclusion-n2",
    );
    const rects = blockRects(slideXml);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toMatchObject({ x: 685800, width: 5330200 });
    expect(rects[1]).toMatchObject({ x: 6176000, width: 5330200 });
  });

  it("N=3 produces three equal blocks whose widths+gaps sum exactly to the content width", () => {
    const slideXml = buildAndRender(
      [
        { scenarioNumero: 1, avecStockage: true, autoconsommationDisplay: "+95", besoinsPct: 52 },
        { scenarioNumero: 2, avecStockage: false, autoconsommationDisplay: "90", besoinsPct: 29 },
        { scenarioNumero: 3, avecStockage: true, autoconsommationDisplay: "80", besoinsPct: 33 },
      ],
      "conclusion-n3",
    );
    const rects = blockRects(slideXml);
    expect(rects).toHaveLength(3);
    expect(rects.map((r) => r.scenarioNumero)).toEqual([1, 2, 3]);

    const CONTENT_MARGIN_X = 685800;
    const CONTENT_WIDTH = 10820400;
    expect(rects[0].x).toBe(CONTENT_MARGIN_X);
    const lastRect = rects[2];
    expect(lastRect.x + lastRect.width).toBe(CONTENT_MARGIN_X + CONTENT_WIDTH);
    expect(rects[1].x).toBeGreaterThan(rects[0].x + rects[0].width);
    expect(rects[2].x).toBeGreaterThan(rects[1].x + rects[1].width);
  });

  it("a storage scenario at the +95 ceiling reads 'Plus de 95 %' with the storage phrasing", () => {
    const slideXml = buildAndRender(
      [{ scenarioNumero: 1, avecStockage: true, autoconsommationDisplay: "+95", besoinsPct: 52 }],
      "conclusion-storage-ceiling",
    );
    expect(slideXml).toContain("<a:t>Plus de 95 % d’autoconsommation</a:t>");
    expect(slideXml).toContain(
      "<a:t> grâce à l’intégration d’une solution de stockage.</a:t>",
    );
    expect(slideXml).toContain("<a:t>52 % des besoins énergétiques du site couverts</a:t>");
    expect(slideXml).toContain("<a:t> par la production photovoltaïque.</a:t>");
  });

  it("a storage scenario below the ceiling reads its exact percentage", () => {
    const slideXml = buildAndRender(
      [{ scenarioNumero: 1, avecStockage: true, autoconsommationDisplay: "80", besoinsPct: 33 }],
      "conclusion-storage-below-ceiling",
    );
    expect(slideXml).toContain("<a:t>80 % d’autoconsommation</a:t>");
    expect(slideXml).toContain(
      "<a:t> grâce à l’intégration d’une solution de stockage.</a:t>",
    );
  });

  it("a non-storage scenario uses the non-storage phrasing", () => {
    const slideXml = buildAndRender(
      [{ scenarioNumero: 1, avecStockage: false, autoconsommationDisplay: "90", besoinsPct: 29 }],
      "conclusion-no-storage",
    );
    expect(slideXml).toContain("<a:t>90 % d’autoconsommation</a:t>");
    expect(slideXml).toContain("<a:t> de la production photovoltaïque.</a:t>");
    expect(slideXml).toContain("<a:t>29 % des besoins énergétiques du site couverts</a:t>");
  });

  it("mixed storage/non-storage scenarios each keep their own phrasing", () => {
    const slideXml = buildAndRender(
      [
        { scenarioNumero: 1, avecStockage: true, autoconsommationDisplay: "+95", besoinsPct: 52 },
        { scenarioNumero: 2, avecStockage: false, autoconsommationDisplay: "90", besoinsPct: 29 },
      ],
      "conclusion-mixed",
    );
    expect(slideXml).toContain("<a:t>Plus de 95 % d’autoconsommation</a:t>");
    expect(slideXml).toContain(
      "<a:t> grâce à l’intégration d’une solution de stockage.</a:t>",
    );
    expect(slideXml).toContain("<a:t>90 % d’autoconsommation</a:t>");
    expect(slideXml).toContain("<a:t> de la production photovoltaïque.</a:t>");
  });

  it("banner is singular for N=1 and plural for N=2/N=3", () => {
    const n1 = buildAndRender(
      [{ scenarioNumero: 1, avecStockage: false, autoconsommationDisplay: "60", besoinsPct: 45 }],
      "conclusion-banner-n1",
    );
    expect(n1).toContain("<a:t>Cette solution est pertinente au vu des résultats. </a:t>");

    const n2 = buildAndRender(
      [
        { scenarioNumero: 1, avecStockage: true, autoconsommationDisplay: "+95", besoinsPct: 52 },
        { scenarioNumero: 2, avecStockage: false, autoconsommationDisplay: "90", besoinsPct: 29 },
      ],
      "conclusion-banner-n2",
    );
    expect(n2).toContain(
      "<a:t>Les solutions présentées sont pertinentes au vu des résultats. </a:t>",
    );
  });

  it("rejects an unsupported scenario count instead of silently degrading the layout", () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const zip = openPptx(SANS_STOCKAGE_FIXTURE);
    expect(() => addConclusionSlide(zip, [])).toThrow(/1 à 3/);

    const fourScenarios: ConclusionScenario[] = Array.from({ length: 4 }, (_, i) => ({
      scenarioNumero: i + 1,
      avecStockage: false,
      autoconsommationDisplay: "60",
      besoinsPct: 45,
    }));
    expect(() => addConclusionSlide(openPptx(SANS_STOCKAGE_FIXTURE), fourScenarios)).toThrow(
      /1 à 3/,
    );
  });
});
