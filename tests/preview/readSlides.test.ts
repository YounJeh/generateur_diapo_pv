// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readSlides } from "../../web/src/preview/readSlides";

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
});
