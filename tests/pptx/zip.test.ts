import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getEntryBuffer,
  getEntryText,
  openPptx,
  setEntryText,
  writePptx,
} from "../../src/pptx/zip.js";

const FIXTURE_PPTX = "assets/templates/template-sans-stockage.pptx";
const OUTPUT_DIR = "test/output";

function hash(buffer: Buffer): string {
  return createHash("md5").update(buffer).digest("hex");
}

describe("pptx zip utility", () => {
  it("round-trips a pptx untouched with byte-identical entries", () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = `${OUTPUT_DIR}/zip-roundtrip.pptx`;

    const original = openPptx(FIXTURE_PPTX);
    const originalEntries = original.getEntries();

    const zip = openPptx(FIXTURE_PPTX);
    // Ne touche rien : simule le cas "aucun remplacement nécessaire".
    writePptx(zip, outputPath);

    const output = openPptx(outputPath);
    for (const entry of originalEntries) {
      const originalBuffer = original.readFile(entry);
      const outputBuffer = getEntryBuffer(output, entry.entryName);
      expect(originalBuffer).not.toBeNull();
      expect(hash(outputBuffer)).toBe(hash(originalBuffer!));
    }
  });

  it("only changes the entry that was explicitly modified", () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = `${OUTPUT_DIR}/zip-partial-edit.pptx`;

    const original = openPptx(FIXTURE_PPTX);
    const zip = openPptx(FIXTURE_PPTX);

    const slide1 = getEntryText(zip, "ppt/slides/slide1.xml");
    setEntryText(zip, "ppt/slides/slide1.xml", slide1.replace("2 rangées", "5 rangées"));
    writePptx(zip, outputPath);

    const output = openPptx(outputPath);
    const outputSlide1 = getEntryText(output, "ppt/slides/slide1.xml");
    expect(outputSlide1).toContain("5 rangées");

    for (const entry of original.getEntries()) {
      if (entry.entryName === "ppt/slides/slide1.xml") continue;
      const originalBuffer = original.readFile(entry);
      const outputBuffer = getEntryBuffer(output, entry.entryName);
      expect(hash(outputBuffer)).toBe(hash(originalBuffer!));
    }
  });

  it("reads a binary entry (media image) as a buffer", () => {
    const zip = openPptx(FIXTURE_PPTX);
    const buffer = getEntryBuffer(zip, "ppt/media/image8.png");
    // Signature PNG
    expect(buffer.subarray(0, 8).toString("hex")).toBe(
      "89504e470d0a1a0a",
    );
  });

  it("throws an explicit error for a missing entry", () => {
    const zip = openPptx(FIXTURE_PPTX);
    expect(() => getEntryText(zip, "ppt/slides/does-not-exist.xml")).toThrow(
      /Entrée introuvable/,
    );
  });
});
