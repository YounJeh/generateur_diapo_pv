import { mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addConclusionSlide } from "../../src/pptx/conclusionSlide.js";
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

function blockRects(slideXml: string): Array<{ x: number; width: number }> {
  return [...slideXml.matchAll(/Scénario (\d) <\/a:t>/g)].map((match) => {
    const scenarioNumero = match[1];
    const before = slideXml.slice(0, match.index);
    const spStart = before.lastIndexOf("<p:sp>");
    const shapeXml = slideXml.slice(spStart, slideXml.indexOf("</p:sp>", match.index));
    const rect = shapeXml.match(/<a:off x="(-?\d+)" y="-?\d+"\/><a:ext cx="(\d+)" cy="\d+"\/>/);
    return { x: Number(rect![1]), width: Number(rect![2]), scenarioNumero: Number(scenarioNumero) };
  });
}

describe("addConclusionSlide", () => {
  it("N=1 produces a single full-width block", () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const zip = openPptx(SANS_STOCKAGE_FIXTURE);
    addConclusionSlide(zip, 1);
    writePptx(zip, `${OUTPUT_DIR}/conclusion-n1.pptx`);

    const output = openPptx(`${OUTPUT_DIR}/conclusion-n1.pptx`);
    const slideXml = lastSlideXml(output);
    const rects = blockRects(slideXml);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toMatchObject({ x: 685800, width: 10820400 });
    expect(slideXml).toContain("<a:t>Scénario 1 </a:t>");
  });

  it("N=2 matches the template's own two-block layout", () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const zip = openPptx(SANS_STOCKAGE_FIXTURE);
    addConclusionSlide(zip, 2);
    writePptx(zip, `${OUTPUT_DIR}/conclusion-n2.pptx`);

    const output = openPptx(`${OUTPUT_DIR}/conclusion-n2.pptx`);
    const rects = blockRects(lastSlideXml(output));
    expect(rects).toHaveLength(2);
    expect(rects[0]).toMatchObject({ x: 685800, width: 5330200 });
    expect(rects[1]).toMatchObject({ x: 6176000, width: 5330200 });
  });

  it("N=3 produces three equal blocks whose widths+gaps sum exactly to the content width", () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const zip = openPptx(SANS_STOCKAGE_FIXTURE);
    addConclusionSlide(zip, 3);
    writePptx(zip, `${OUTPUT_DIR}/conclusion-n3.pptx`);

    const output = openPptx(`${OUTPUT_DIR}/conclusion-n3.pptx`);
    const rects = blockRects(lastSlideXml(output));
    expect(rects).toHaveLength(3);
    expect(rects.map((r) => r.scenarioNumero)).toEqual([1, 2, 3]);

    const CONTENT_MARGIN_X = 685800;
    const CONTENT_WIDTH = 10820400;
    expect(rects[0].x).toBe(CONTENT_MARGIN_X);
    const lastRect = rects[2];
    expect(lastRect.x + lastRect.width).toBe(CONTENT_MARGIN_X + CONTENT_WIDTH);
    // Pas de chevauchement entre blocs consécutifs.
    expect(rects[1].x).toBeGreaterThan(rects[0].x + rects[0].width);
    expect(rects[2].x).toBeGreaterThan(rects[1].x + rects[1].width);
  });
});
